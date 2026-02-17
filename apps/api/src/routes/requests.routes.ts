// apps/api/src/routes/requests.routes.ts

import { Router } from 'express';
import { Types } from 'mongoose';

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import PDFDocument from 'pdfkit';

import bcrypt from 'bcryptjs';
import { requireAuth, requireRole, AuthUserPayload } from '../middleware/auth';

import ChangeRequest from '../models/ChangeRequest';
import Person from '../models/Person';
import Unit from '../models/Unit';
import User from '../models/User';

import { getDescendantUnitIds } from '../lib/unitTree';
import { sendNewUserCredentials } from '../utils/sendEmail';

const r = Router();

const isValidObjectId = (id: unknown) => typeof id === 'string' && Types.ObjectId.isValid(id);

/**
 * ✅ Shtuam CREATE_USER
 */
const allowedTypes = [
    'DELETE_PERSON',
    'TRANSFER_PERSON',
    'CHANGE_GRADE',
    'CHANGE_UNIT',
    'DEACTIVATE_PERSON',
    'UPDATE_PERSON',
    'CREATE_USER',
] as const;

type AllowedType = (typeof allowedTypes)[number];

function pickAllowedPersonPatch(patch: any) {
    const out: any = {};
    if (!patch || typeof patch !== 'object') return out;

    const allow = [
        'serviceNo',
        'firstName',
        'lastName',
        'personalNumber',
        'birthDate',
        'gender',
        'city',
        'address',
        'phone',
        'position',
        'serviceStartDate',
        'notes',
        'photoUrl',
    ];

    for (const k of allow) {
        if (k in patch) out[k] = patch[k];
    }
    return out;
}

/* =========================================
   PDF helpers
   ========================================= */

function formatDate(d?: any) {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);

    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy}`;
}

function safeText(v: any) {
    return String(v ?? '').trim();
}

function requestTypeLabel(t: string) {
    switch (t) {
        case 'DELETE_PERSON':
            return 'Fshirje nga sistemi';
        case 'TRANSFER_PERSON':
            return 'Transferim (në njësi tjetër)';
        case 'CHANGE_GRADE':
            return 'Ndryshim grade';
        case 'CHANGE_UNIT':
            return 'Ndryshim njësie';
        case 'DEACTIVATE_PERSON':
            return 'Çaktivizim';
        case 'UPDATE_PERSON':
            return 'Përditësim të dhënash';
        case 'CREATE_USER':
            return 'Krijim përdoruesi';
        default:
            return t;
    }
}

function prettyFieldLabel(k: string) {
    const map: Record<string, string> = {
        serviceNo: 'Nr. shërbimit',
        firstName: 'Emri',
        lastName: 'Mbiemri',
        personalNumber: 'Nr. personal',
        birthDate: 'Data e lindjes',
        gender: 'Gjinia',
        city: 'Qyteti',
        address: 'Adresa',
        phone: 'Numër telefoni',
        position: 'Pozita',
        serviceStartDate: 'Data e fillimit të shërbimit',
        notes: 'Shënime',
        photoUrl: 'Foto (URL)',
    };
    return map[k] || k;
}

function formatValue(v: any) {
    if (v === null || v === undefined) return '—';
    if (v instanceof Date) return formatDate(v);

    if (typeof v === 'string') {
        const s = v.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatDate(s);
        return s.length ? s : '—';
    }

    if (typeof v === 'number' || typeof v === 'boolean') return String(v);

    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function drawHR(doc: PDFKit.PDFDocument, y: number, color = '#9aa0a6') {
    doc.save();
    doc.strokeColor(color).lineWidth(1);
    doc.moveTo(60, y).lineTo(535, y).stroke();
    doc.restore();
}

function drawHeader(doc: PDFKit.PDFDocument, opts: { leftLogo?: string | null; rightLogo?: string | null }) {
    const marginL = 60;
    const marginR = 60;
    const pageW = doc.page.width;

    const top = 50;
    const logoW = 70;
    const leftLogoX = marginL;
    const rightLogoX = pageW - marginR - logoW;

    if (opts.leftLogo) {
        try {
            doc.image(opts.leftLogo, leftLogoX, top, { width: logoW });
        } catch { }
    }

    if (opts.rightLogo) {
        try {
            doc.image(opts.rightLogo, rightLogoX, top, { width: logoW });
        } catch { }
    }

    const midX = leftLogoX + logoW + 15;
    const midW = rightLogoX - 15 - midX;

    doc
        .font('Times-Bold')
        .fontSize(10)
        .fillColor('#111')
        .text('VETËM PËR PËRDORIM TË BRENDSHËM', midX, top + 5, { width: midW, align: 'center' });

    doc
        .font('Times-Roman')
        .fontSize(13)
        .fillColor('#111')
        .text('Komanda e Forcave Tokësore', midX, top + 25, { width: midW, align: 'center' });

    const lineY = top + 85;
    drawHR(doc, lineY);

    doc.y = lineY + 30;
}

function drawTitle(doc: PDFKit.PDFDocument, title: string) {
    const x = 60;
    const w = doc.page.width - 60 - 60;

    doc.moveDown(0.2);
    doc.font('Times-Bold').fontSize(13).fillColor('#111');
    doc.text(title.toUpperCase(), x, doc.y, { width: w, align: 'center' });

    doc.y += 38;
}

function drawMetaBox(doc: PDFKit.PDFDocument, meta: { docNo: string; date: string }) {
    const x = 60;
    const y = doc.y;

    doc.font('Times-Roman').fontSize(10).fillColor('#111');
    doc.text(`Nr. Prot: ${meta.docNo}`, x, y);
    doc.text(`Data: ${meta.date}`, x, y + 16);

    doc.y = y + 58;
}

function buildPersonLine(person: any, fallbackId: any) {
    const sn = safeText(person?.serviceNo);
    const fn = safeText(person?.firstName);
    const ln = safeText(person?.lastName);

    if (sn || fn || ln) return `${sn ? sn + ' — ' : ''}${fn} ${ln}`.trim();
    return safeText(fallbackId);
}

async function getUnitName(unitId: any) {
    if (!unitId) return null;
    const u = await Unit.findById(unitId).select('code name').lean();
    if (!u) return null;

    const code = safeText((u as any).code);
    const name = safeText((u as any).name);
    return `${code ? code + ' — ' : ''}${name}`.trim();
}

function writeParagraph(doc: PDFKit.PDFDocument, text: string) {
    doc.font('Times-Roman').fontSize(11).fillColor('#111');
    doc.text(text, { align: 'justify', lineGap: 3 });
    doc.moveDown(0.8);
}

function writeDecisionLine(doc: PDFKit.PDFDocument, decisionWord: 'APROVOHET' | 'REFUZOHET', rest: string) {
    const x = 60;
    const w = doc.page.width - 60 - 60;

    doc.font('Times-Roman').fontSize(11).fillColor('#111');

    doc.text('Në bazë të kërkesës së paraqitur dhe pas shqyrtimit të saj, ', x, doc.y, {
        width: w,
        continued: true,
        align: 'left',
    });

    doc.font('Times-Bold').text(`${decisionWord} `, { continued: true });

    doc.font('Times-Roman').text(String(rest ?? '').trim(), {
        width: w,
        align: 'left',
    });

    doc.moveDown(0.9);
}

/**
 * Gjeneron PDF për një ChangeRequest dhe kthen url lokale: /uploads/requests/<file>.pdf
 */
async function generateRequestPdf(opts: {
    reqDoc: any;
    personBefore?: any;
    personAfter?: any;
    createdBySnap?: any;
    decidedBySnap?: any;
}) {
    const { reqDoc } = opts;

    const uploadsDir = path.join(process.cwd(), 'uploads', 'requests');
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `req-${String(reqDoc._id)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    const leftLogo = path.join(process.cwd(), 'uploads', 'assets', 'logo-left.png');
    const rightLogo = path.join(process.cwd(), 'uploads', 'assets', 'logo-right.png');
    const leftLogoPath = fssync.existsSync(leftLogo) ? leftLogo : null;
    const rightLogoPath = fssync.existsSync(rightLogo) ? rightLogo : null;

    const personBefore = opts.personBefore || reqDoc.personId || {};
    const personAfter = opts.personAfter || null;

    const createdBy = opts.createdBySnap || reqDoc.createdBy || {};
    const decidedBy = opts.decidedBySnap || reqDoc.decidedBy || {};

    const personLine = buildPersonLine(personBefore, reqDoc.personId);

    const status = safeText(reqDoc.status);
    const reason = safeText(reqDoc?.payload?.reason);
    const decisionNote = safeText(reqDoc.decisionNote);

    const patch =
        reqDoc?.payload?.meta?.patch && typeof reqDoc.payload.meta.patch === 'object' ? reqDoc.payload.meta.patch : null;

    const docNo = safeText(reqDoc.docNo) || `REQ-${new Date().getFullYear()}-${String(reqDoc._id).slice(-6)}`;

    const toUnitName =
        reqDoc?.payload?.toUnitId?.name
            ? `${safeText(reqDoc.payload.toUnitId.code) ? safeText(reqDoc.payload.toUnitId.code) + ' — ' : ''}${safeText(
                reqDoc.payload.toUnitId.name
            )}`.trim()
            : await getUnitName(reqDoc?.payload?.toUnitId);

    const fromUnitName =
        reqDoc?.targetUnitId?.name
            ? `${safeText(reqDoc.targetUnitId.code) ? safeText(reqDoc.targetUnitId.code) + ' — ' : ''}${safeText(
                reqDoc.targetUnitId.name
            )}`.trim()
            : await getUnitName(reqDoc?.targetUnitId);

    const newGrade = safeText(reqDoc?.payload?.newGradeId);

    await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, left: 60, right: 60, bottom: 55 },
        });

        const stream = fssync.createWriteStream(filePath);
        doc.pipe(stream);

        drawHeader(doc, { leftLogo: leftLogoPath, rightLogo: rightLogoPath });
        drawTitle(doc, 'Kërkesë – Vendim');

        drawMetaBox(doc, {
            docNo,
            date: formatDate(reqDoc.decidedAt || reqDoc.updatedAt || reqDoc.createdAt),
        });

        doc.font('Times-Roman').fontSize(11).fillColor('#111');
        doc.text(`Personi: ${personLine}`);
        doc.text(`Lloji i kërkesës: ${requestTypeLabel(String(reqDoc.type))}`);
        doc.moveDown(0.8);

        if (status === 'APPROVED') {
            writeDecisionLine(
                doc,
                'APROVOHET',
                `kërkesa për "${requestTypeLabel(String(reqDoc.type))}" për personin e lartcekur, dhe urdhërohet zbatimi nga njësia përkatëse.`
            );
        } else if (status === 'REJECTED') {
            writeDecisionLine(doc, 'REFUZOHET', `kërkesa për "${requestTypeLabel(String(reqDoc.type))}" për personin e lartcekur.`);
        }

        if (status === 'PENDING' && reason) {
            doc.font('Times-Bold').fontSize(11).text('Arsyeja:');
            doc.font('Times-Roman').fontSize(11).text(reason, { align: 'justify', lineGap: 3 });
            doc.moveDown(0.8);
        }

        if (reqDoc.type === 'CHANGE_UNIT' || reqDoc.type === 'TRANSFER_PERSON') {
            doc.font('Times-Bold').fontSize(11).text('Detaje:');
            doc.font('Times-Roman').fontSize(11);
            doc.text(`Njësia aktuale: ${fromUnitName || '—'}`);
            doc.text(`Njësia e re: ${toUnitName || '—'}`);
            doc.moveDown(0.8);
        }

        if (reqDoc.type === 'CHANGE_GRADE') {
            doc.font('Times-Bold').fontSize(11).text('Detaje:');
            doc.font('Times-Roman').fontSize(11);
            doc.text(`Grada e re: ${newGrade || '—'}`);
            doc.moveDown(0.8);
        }

        if (reqDoc.type === 'DEACTIVATE_PERSON') {
            writeParagraph(doc, 'Statusi i personit ndryshohet në: INACTIVE.');
        }

        if (reqDoc.type === 'DELETE_PERSON') {
            writeParagraph(doc, 'Personi fshihet nga sistemi sipas kërkesës së aprovuar.');
        }

        if (reqDoc.type === 'UPDATE_PERSON') {
            const keys = patch ? Object.keys(patch) : [];
            doc.font('Times-Bold').fontSize(11).text('Ndryshimet e kërkuara:');
            doc.moveDown(0.3);

            if (!patch || keys.length === 0) {
                doc.font('Times-Roman').fontSize(11).text('—');
            } else {
                doc.font('Times-Roman').fontSize(11);
                for (const k of keys) {
                    const newVal = (patch as any)[k];
                    const oldVal = (personBefore as any)?.[k];
                    const afterVal = personAfter ? (personAfter as any)?.[k] : undefined;
                    const finalNew = afterVal !== undefined ? afterVal : newVal;
                    doc.text(`• ${prettyFieldLabel(k)}: ${formatValue(oldVal)}  →  ${formatValue(finalNew)}`);
                }
            }
            doc.moveDown(0.8);
        }

        if (decisionNote) {
            doc
                .font('Times-Bold')
                .fontSize(11)
                .text(status === 'REJECTED' ? 'Arsyeja e refuzimit:' : 'Shënim vendimi:');
            doc.font('Times-Roman').fontSize(11).text(decisionNote, { align: 'justify', lineGap: 3 });
            doc.moveDown(0.8);
        }

        // Footer signatures
        const marginL = 60;
        const marginR = 60;
        const pageW = doc.page.width;

        const footerOffsetFromBottom = 90;
        const footerTopY = doc.page.height - doc.page.margins.bottom - footerOffsetFromBottom;

        const leftX = marginL;
        const rightLineEndX = pageW - marginR;

        const leftLineWidth = 120;
        const rightLineWidth = 160;

        const rightLineStartX = rightLineEndX - rightLineWidth;
        const lineY = footerTopY;

        doc.save();
        doc.strokeColor('#9aa0a6').lineWidth(1);

        doc.moveTo(leftX, lineY).lineTo(leftX + leftLineWidth, lineY).stroke();
        doc.moveTo(rightLineStartX, lineY).lineTo(rightLineEndX, lineY).stroke();

        doc.restore();

        const textY = lineY + 8;

        doc.font('Times-Bold').fontSize(11);
        doc.text(safeText(createdBy.username) || '—', leftX, textY, { width: leftLineWidth, align: 'center' });

        doc.font('Times-Italic').fontSize(9);
        doc.text(`(${safeText(createdBy.role) || '—'})`, leftX, textY + 13, { width: leftLineWidth, align: 'center' });

        doc.font('Times-Bold').fontSize(11);
        doc.text(safeText(decidedBy.username) || '—', rightLineStartX, textY, { width: rightLineWidth, align: 'center' });

        doc.font('Times-Italic').fontSize(9);
        doc.text(`(${safeText(decidedBy.role) || '—'})`, rightLineStartX, textY + 13, {
            width: rightLineWidth,
            align: 'center',
        });

        doc.y = Math.max(doc.y, textY + 28);

        doc.end();

        stream.on('finish', () => resolve());
        stream.on('error', (e) => reject(e));
    });

    return {
        filePath,
        publicPath: `/uploads/requests/${fileName}`,
        docNo,
    };
}

/**
 * Kontroll i lejeve për me lexu një request (përdoret edhe për PDF)
 */
async function canAccessRequest(me: AuthUserPayload, doc: any) {
    if (!doc) return false;

    if (me.role === 'ADMIN' || me.role === 'AUDITOR') return true;

    if (me.role === 'OPERATOR' || me.role === 'OFFICER') {
        return String((doc as any).createdBy?._id ?? doc.createdBy) === String(me.id);
    }

    if (me.role === 'COMMANDER') {
        if (!me.unitId) return false;
        const unitIds = await getDescendantUnitIds(String(me.unitId));
        const target = String((doc as any).targetUnitId?._id ?? doc.targetUnitId);
        return unitIds.includes(target);
    }

    return false;
}

/* =========================================
   POST /api/requests (create)
   ========================================= */

r.post('/', requireAuth, requireRole('OPERATOR', 'OFFICER', 'ADMIN', 'COMMANDER'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const { type, personId, payload } = req.body ?? {};

    if (!type) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'type required' });
    }

    if (!allowedTypes.includes(String(type) as any)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'invalid type' });
    }

    const p: any = payload ?? {};

    /**
     * ✅ CREATE_USER: nuk kërkon personId
     * - lejo vetëm COMMANDER ose ADMIN
     */
    if (String(type) === 'CREATE_USER') {
        if (me.role !== 'COMMANDER' && me.role !== 'ADMIN') {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'Only COMMANDER/ADMIN can create CREATE_USER requests' });
        }

        const u = p?.user ?? {};
        const username = String(u?.username ?? '').trim();
        const email = String(u?.email ?? '').trim();
        const role = String(u?.role ?? '').trim();

        if (!username || !email || !role) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                message: 'payload.user.username, payload.user.email, payload.user.role required',
            });
        }

        // targetUnitId: zakonisht unit i komandantit; admin mundet me e lon null
        const targetUnitId = me.unitId ? new Types.ObjectId(me.unitId) : null;

        const doc = await ChangeRequest.create({
            type: 'CREATE_USER',
            status: 'PENDING',
            createdBy: new Types.ObjectId(me.id),
            createdByRole: me.role,
            createdByUnitId: me.unitId ? new Types.ObjectId(me.unitId) : null,
            personId: null,
            targetUnitId,
            payload: {
                reason: p.reason ?? '',
                user: {
                    username,
                    email,
                    role,
                    unitId: u?.unitId ?? (me.unitId ?? null),
                    contractValidFrom: u?.contractValidFrom ?? null,
                    contractValidTo: u?.contractValidTo ?? null,
                    neverExpires: u?.neverExpires !== undefined ? !!u.neverExpires : true,
                    mustChangePassword: u?.mustChangePassword !== undefined ? !!u.mustChangePassword : true,
                },
            },
            docNo: '',
            pdf: { path: '', generatedAt: null },
        });

        const out = await ChangeRequest.findById(doc._id)
            .populate('targetUnitId', 'code name')
            .populate('createdBy', 'username role unitId')
            .lean();

        return res.status(201).json(out);
    }

    /**
     * ✅ Person requests: kërkojnë personId
     */
    if (!personId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'personId required' });
    }

    if (!isValidObjectId(String(personId))) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'personId invalid' });
    }

    const person = await Person.findById(personId).lean();
    if (!person) return res.status(404).json({ code: 'NOT_FOUND', message: 'Person not found' });

    const targetUnitId = String((person as any).unitId);

    if (me.role !== 'ADMIN') {
        if (!me.unitId) return res.status(403).json({ code: 'FORBIDDEN', message: 'User has no unitId' });

        if (String(me.unitId) !== targetUnitId) {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'Person is not in your unit' });
        }
    }

    if ((type === 'TRANSFER_PERSON' || type === 'CHANGE_UNIT') && !p.toUnitId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'payload.toUnitId required' });
    }

    if (type === 'CHANGE_GRADE' && !p.newGradeId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'payload.newGradeId required' });
    }

    if (type === 'UPDATE_PERSON') {
        const patch = pickAllowedPersonPatch(p?.meta?.patch);
        if (!patch || Object.keys(patch).length === 0) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                message: 'payload.meta.patch is required (at least one field)',
            });
        }
    }

    if (p.toUnitId) {
        if (!isValidObjectId(String(p.toUnitId))) {
            return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'toUnitId invalid' });
        }
        const toU = await Unit.findById(p.toUnitId).select('_id').lean();
        if (!toU) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'toUnitId invalid' });
    }

    const existsPending = await ChangeRequest.findOne({
        personId: new Types.ObjectId(personId),
        type,
        status: 'PENDING',
    }).lean();

    if (existsPending) {
        return res.status(409).json({ code: 'ALREADY_PENDING', message: 'A pending request already exists' });
    }

    const safePatch = type === 'UPDATE_PERSON' ? pickAllowedPersonPatch(p?.meta?.patch) : undefined;

    const doc = await ChangeRequest.create({
        type,
        status: 'PENDING',
        createdBy: new Types.ObjectId(me.id),
        createdByRole: me.role,
        createdByUnitId: me.unitId ? new Types.ObjectId(me.unitId) : null,
        personId: new Types.ObjectId(personId),
        targetUnitId: new Types.ObjectId(targetUnitId),
        payload: {
            toUnitId: p.toUnitId ? new Types.ObjectId(p.toUnitId) : null,
            newGradeId: p.newGradeId ?? null,
            reason: p.reason ?? '',
            meta: {
                ...(p.meta ?? {}),
                ...(safePatch ? { patch: safePatch } : {}),
            },
        },
        docNo: '',
        pdf: { path: '', generatedAt: null },
    });

    const out = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .lean();

    res.status(201).json(out);
});

/* =========================================
   GET /api/requests/my
   ========================================= */

r.get('/my', requireAuth, requireRole('OPERATOR', 'OFFICER', 'ADMIN', 'AUDITOR'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const status = (req.query.status ? String(req.query.status).toUpperCase() : undefined) as any;

    const filter: any = { createdBy: new Types.ObjectId(me.id) };

    if (status) {
        if (status === 'ARCHIVE') filter.status = { $in: ['APPROVED', 'REJECTED', 'CANCELLED'] };
        else if (['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) filter.status = status;
    }

    const [items, total] = await Promise.all([
        ChangeRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
            .populate('targetUnitId', 'code name')
            .populate('payload.toUnitId', 'code name')
            .populate('createdBy', 'username role unitId')
            .populate('decidedBy', 'username role')
            .lean(),
        ChangeRequest.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

/* =========================================
   GET /api/requests/incoming (inbox alias)
   ========================================= */

async function incomingHandler(req: any, res: any) {
    const me = req.user as AuthUserPayload;

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const status = (req.query.status ? String(req.query.status).toUpperCase() : 'PENDING') as any;

    const filter: any = {};

    if (status === 'ARCHIVE') filter.status = { $in: ['APPROVED', 'REJECTED', 'CANCELLED'] };
    else if (['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) filter.status = status;

    if (me.role === 'COMMANDER') {
        if (!me.unitId) return res.status(403).json({ code: 'FORBIDDEN', message: 'Commander has no unitId' });

        const unitIds = await getDescendantUnitIds(String(me.unitId));
        filter.targetUnitId = { $in: unitIds.map((id) => new Types.ObjectId(id)) };
    }

    const [items, total] = await Promise.all([
        ChangeRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
            .populate('targetUnitId', 'code name')
            .populate('payload.toUnitId', 'code name')
            .populate('createdBy', 'username role unitId')
            .populate('decidedBy', 'username role')
            .lean(),
        ChangeRequest.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}

r.get('/incoming', requireAuth, requireRole('COMMANDER', 'ADMIN', 'AUDITOR'), incomingHandler);
r.get('/inbox', requireAuth, requireRole('COMMANDER', 'ADMIN', 'AUDITOR'), incomingHandler);

/* =========================================
   GET /api/requests/:id
   ========================================= */

r.get('/:id', requireAuth, requireRole('COMMANDER', 'ADMIN', 'AUDITOR', 'OFFICER', 'OPERATOR'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const doc = await ChangeRequest.findById(req.params.id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    if (!doc) return res.status(404).json({ code: 'NOT_FOUND' });

    const ok = await canAccessRequest(me, doc);
    if (!ok) return res.status(403).json({ code: 'FORBIDDEN' });

    res.json(doc);
});

/* =========================================
   GET /api/requests/:id/pdf
   ========================================= */

r.get('/:id/pdf', requireAuth, requireRole('COMMANDER', 'ADMIN', 'AUDITOR', 'OFFICER', 'OPERATOR'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const doc: any = await ChangeRequest.findById(req.params.id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    if (!doc) return res.status(404).json({ code: 'NOT_FOUND' });

    const ok = await canAccessRequest(me, doc);
    if (!ok) return res.status(403).json({ code: 'FORBIDDEN' });

    if (!doc?.pdf?.path) {
        const fresh: any = await ChangeRequest.findById(req.params.id)
            .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
            .populate('targetUnitId', 'code name')
            .populate('payload.toUnitId', 'code name')
            .populate('createdBy', 'username role unitId')
            .populate('decidedBy', 'username role')
            .lean();

        const gen = await generateRequestPdf({ reqDoc: fresh });

        await ChangeRequest.findByIdAndUpdate(req.params.id, {
            $set: {
                docNo: gen.docNo,
                pdf: { path: gen.publicPath, generatedAt: new Date() },
            },
        });

        doc.pdf = { path: gen.publicPath, generatedAt: new Date() };
        doc.docNo = gen.docNo;
    }

    const abs = path.join(process.cwd(), doc.pdf.path.replace(/^\//, ''));
    if (!fssync.existsSync(abs)) {
        return res.status(404).json({ code: 'PDF_NOT_FOUND' });
    }

    const fileName = `request-${doc.docNo || String(doc._id)}.pdf`;
    const download = String(req.query.download ?? '') === '1' || String(req.query.download ?? '') === 'true';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);

    fssync.createReadStream(abs).pipe(res);
});

/* =========================================
   POST /api/requests/:id/approve
   ========================================= */

r.post('/:id/approve', requireAuth, requireRole('COMMANDER', 'ADMIN'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const { note } = req.body ?? {};

    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const doc: any = await ChangeRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ code: 'NOT_FOUND' });
    if (doc.status !== 'PENDING') return res.status(400).json({ code: 'NOT_PENDING' });

    if (me.role === 'COMMANDER') {
        if (!me.unitId) return res.status(403).json({ code: 'FORBIDDEN' });

        const unitIds = await getDescendantUnitIds(String(me.unitId));
        if (!unitIds.includes(String(doc.targetUnitId))) return res.status(403).json({ code: 'FORBIDDEN' });
    }

    /**
     * ✅ CREATE_USER: e krijon realisht user-in + dërgon email (ADMIN)
     */
    if (doc.type === 'CREATE_USER') {
        if (me.role !== 'ADMIN') {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'Only ADMIN can approve CREATE_USER' });
        }

        const u = doc.payload?.user ?? {};
        const username = String(u?.username ?? '').trim();
        const email = String(u?.email ?? '').trim();
        const role = String(u?.role ?? '').trim();
        const unitIdRaw = u?.unitId ?? null;

        if (!username || !email || !role) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                message: 'payload.user.username, payload.user.email, payload.user.role required',
            });
        }

        if (unitIdRaw && !Types.ObjectId.isValid(String(unitIdRaw))) {
            return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'payload.user.unitId invalid' });
        }

        const exists = await User.findOne({ username }).select('_id username').lean();
        if (exists) {
            return res.status(409).json({ code: 'USER_EXISTS', message: 'Username already exists' });
        }

        // ✅ gjenero password të përkohshëm + hash
        const tempPassword = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const neverExpires = u?.neverExpires !== undefined ? !!u.neverExpires : true;
        const contractValidFrom = u?.contractValidFrom ? new Date(u.contractValidFrom) : null;
        const contractValidTo = u?.contractValidTo ? new Date(u.contractValidTo) : null;

        // ✅ krijo user-in
        const createdUser = await User.create({
            username,
            passwordHash,
            role,
            unitId: unitIdRaw ? new Types.ObjectId(String(unitIdRaw)) : null,
            mustChangePassword: u?.mustChangePassword !== undefined ? !!u.mustChangePassword : true,
            neverExpires,
            contractValidFrom: neverExpires ? null : contractValidFrom,
            contractValidTo: neverExpires ? null : contractValidTo,
        });

        // ✅ shëno request si approved
        doc.status = 'APPROVED';
        doc.decidedBy = new Types.ObjectId(me.id);
        doc.decidedAt = new Date();
        doc.decisionNote = note ?? '';

        doc.payload = doc.payload || {};
        doc.payload.meta = doc.payload.meta || {};
        doc.payload.meta.createdUserId = createdUser._id;

        await doc.save();

        // ✅ gjej label të njësisë (opsionale për email)
        let unitLabel: string | undefined = undefined;
        try {
            const uid = unitIdRaw ? new Types.ObjectId(String(unitIdRaw)) : null;
            if (uid) {
                const unitDoc = await Unit.findById(uid).select('code name').lean();
                if (unitDoc) {
                    const code = String((unitDoc as any).code ?? '').trim();
                    const name = String((unitDoc as any).name ?? '').trim();
                    unitLabel = `${code ? code + ' — ' : ''}${name}`.trim();
                }
            }
        } catch { }

        // ✅ dërgo email (mos e blloko flow nëse dështon)
        let emailSent = false;
        try {
            await sendNewUserCredentials({
                to: email,
                username,
                tempPassword,
                role,
                unitLabel,
            });
            emailSent = true;
        } catch (e) {
            console.error('❌ Email credentials failed:', e);
            emailSent = false;
        }

        const out = await ChangeRequest.findById(doc._id)
            .populate('targetUnitId', 'code name')
            .populate('createdBy', 'username role unitId')
            .populate('decidedBy', 'username role')
            .lean();

        // ✅ DEV helper (mundesh me e hjek në PROD)
        return res.json({
            ...out,
            emailSent,
            __tempCredentials: { username, password: tempPassword, email },
        });
    }

    // --------- Person flows (siç i kishe) ---------

    const personBefore: any = await Person.findById(doc.personId).lean();
    if (!personBefore && doc.type !== 'DELETE_PERSON') return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (doc.type === 'DELETE_PERSON') {
        await Person.findByIdAndDelete(doc.personId);
    } else {
        const person: any = await Person.findById(doc.personId);
        if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

        if (doc.type === 'DEACTIVATE_PERSON') {
            person.status = 'INACTIVE';
            await person.save();
        }

        if (doc.type === 'CHANGE_GRADE') {
            if (!doc.payload?.newGradeId) return res.status(400).json({ code: 'INVALID_PAYLOAD' });
            person.gradeId = String(doc.payload.newGradeId);
            await person.save();
        }

        if (doc.type === 'CHANGE_UNIT' || doc.type === 'TRANSFER_PERSON') {
            if (!doc.payload?.toUnitId) return res.status(400).json({ code: 'INVALID_PAYLOAD' });
            person.unitId = new Types.ObjectId(String(doc.payload.toUnitId));
            await person.save();
        }

        if (doc.type === 'UPDATE_PERSON') {
            const patch = pickAllowedPersonPatch(doc.payload?.meta?.patch);
            if (!patch || Object.keys(patch).length === 0) {
                return res.status(400).json({ code: 'INVALID_PAYLOAD', message: 'Missing patch' });
            }

            if (typeof patch.serviceNo === 'string') person.serviceNo = patch.serviceNo.trim();
            if (typeof patch.firstName === 'string') person.firstName = patch.firstName.trim();
            if (typeof patch.lastName === 'string') person.lastName = patch.lastName.trim();

            if (typeof patch.personalNumber === 'string') person.personalNumber = patch.personalNumber.trim();
            if (patch.personalNumber === null) person.personalNumber = null;

            if (patch.birthDate) person.birthDate = new Date(patch.birthDate);
            if (typeof patch.gender === 'string') person.gender = patch.gender;

            if (typeof patch.city === 'string') person.city = patch.city.trim();
            if (typeof patch.address === 'string') person.address = patch.address.trim();
            if (typeof patch.phone === 'string') person.phone = patch.phone.trim();

            if (typeof patch.position === 'string') person.position = patch.position.trim();
            if (patch.serviceStartDate) person.serviceStartDate = new Date(patch.serviceStartDate);

            if (typeof patch.notes === 'string') person.notes = patch.notes.trim() ? patch.notes.trim() : null;
            if (patch.notes === null) person.notes = null;

            if (typeof patch.photoUrl === 'string') person.photoUrl = patch.photoUrl.trim() ? patch.photoUrl.trim() : null;
            if (patch.photoUrl === null) person.photoUrl = null;

            await person.save();
        }
    }

    doc.status = 'APPROVED';
    doc.decidedBy = new Types.ObjectId(me.id);
    doc.decidedAt = new Date();
    doc.decisionNote = note ?? '';
    await doc.save();

    const personAfter = doc.type === 'DELETE_PERSON' ? null : await Person.findById(doc.personId).lean();

    const fullForPdf = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    const gen = await generateRequestPdf({
        reqDoc: fullForPdf,
        personBefore: personBefore || fullForPdf?.personId,
        personAfter: personAfter || null,
    });

    doc.docNo = gen.docNo;
    doc.pdf = { path: gen.publicPath, generatedAt: new Date() };
    await doc.save();

    const out = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    res.json(out);
});

/* =========================================
   POST /api/requests/:id/reject
   ========================================= */

r.post('/:id/reject', requireAuth, requireRole('COMMANDER', 'ADMIN'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const { note } = req.body ?? {};

    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    if (!note || String(note).trim().length < 2) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'note required' });
    }

    const doc: any = await ChangeRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ code: 'NOT_FOUND' });
    if (doc.status !== 'PENDING') return res.status(400).json({ code: 'NOT_PENDING' });

    if (me.role === 'COMMANDER') {
        if (!me.unitId) return res.status(403).json({ code: 'FORBIDDEN' });

        const unitIds = await getDescendantUnitIds(String(me.unitId));
        if (!unitIds.includes(String(doc.targetUnitId))) return res.status(403).json({ code: 'FORBIDDEN' });
    }

    const personBefore: any = await Person.findById(doc.personId).lean();

    doc.status = 'REJECTED';
    doc.decidedBy = new Types.ObjectId(me.id);
    doc.decidedAt = new Date();
    doc.decisionNote = String(note).trim();
    await doc.save();

    const fullForPdf = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    const gen = await generateRequestPdf({
        reqDoc: fullForPdf,
        personBefore: personBefore || fullForPdf?.personId,
    });

    doc.docNo = gen.docNo;
    doc.pdf = { path: gen.publicPath, generatedAt: new Date() };
    await doc.save();

    const out = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    res.json(out);
});

/* =========================================
   POST /api/requests/:id/cancel
   ========================================= */

r.post('/:id/cancel', requireAuth, requireRole('OPERATOR', 'OFFICER', 'ADMIN'), async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const { note } = req.body ?? {};

    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const doc: any = await ChangeRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ code: 'NOT_FOUND' });

    if (doc.status !== 'PENDING') {
        return res.status(400).json({ code: 'NOT_PENDING', message: 'Only PENDING requests can be cancelled' });
    }

    if (me.role !== 'ADMIN') {
        if (String(doc.createdBy) !== String(me.id)) {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'You can cancel only your requests' });
        }
    }

    doc.status = 'CANCELLED';
    doc.decidedBy = new Types.ObjectId(me.id);
    doc.decidedAt = new Date();
    doc.decisionNote = note ?? '';
    await doc.save();

    const out = await ChangeRequest.findById(doc._id)
        .populate('personId', 'serviceNo firstName lastName unitId gradeId status')
        .populate('targetUnitId', 'code name')
        .populate('payload.toUnitId', 'code name')
        .populate('createdBy', 'username role unitId')
        .populate('decidedBy', 'username role')
        .lean();

    res.json(out);
});

export default r;