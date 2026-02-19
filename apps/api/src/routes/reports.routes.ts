// apps/api/src/routes/reports.routes.ts

import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

import fs from 'node:fs';
import path from 'node:path';

import DailyReport from '../models/DailyReport';
import Justification from '../models/Justification';
import Unit from '../models/Unit';
import Category from '../models/Category';
import { requireAuth, requireRole } from '../middleware/auth';

const r = Router();

/* ============ helpers bazë ============ */

function isObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ✅ kthen unit (id/code/name) për shfaqje në UI
async function getUnitBrief(unitId: any): Promise<{ id: string; code?: string; name?: string } | null> {
  try {
    if (!unitId) return null;

    const u = await (Unit as any)
      .findById(unitId)
      .select('_id code name')
      .lean();

    if (!u) return null;

    return { id: String(u._id), code: u.code, name: u.name };
  } catch {
    return null;
  }
}

async function resolveUnitId(unit: string) {
  if (!unit) return undefined;

  // nëse është ObjectId, ktheje direkt
  if (isObjectId(unit)) return unit;

  // nëse është code, gjeje Unit-in
  const u = await Unit.findOne({ code: unit }).select('_id').lean();
  return u?._id?.toString();
}

function sameUnit(user: any, repUnitId: any): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!user.unitId) return false;
  return String(user.unitId) === String(repUnitId);
}

/* ============ rregullat kohore ============ */

// orari zyrtar: s’lejohen dorëzime/editime PAS orës 16:00 për RAPORTIN E SOTËM
function isAfterCutoff(): boolean {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(16, 0, 0, 0);
  return now.getTime() > cutoff.getTime();
}

function isSameDayUTC(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function todayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function needsPeriod(categoryId: string) {
  const c = await Category.findById(categoryId).lean();
  if (!c) return false;
  return ['01-12', '01-13'].includes((c as any).code); // Pushim Vjetor / Pushim Mjekësor
}

// Lock + kontroll i njësisë
async function ensureReportEditable(reportId: string, user: any) {
  const rep = await DailyReport.findById(reportId).lean();
  if (!rep) return { ok: false, code: 404 as const, msg: 'NOT_FOUND' };

  if (!sameUnit(user, (rep as any).unitId)) {
    return { ok: false, code: 403 as const, msg: 'FORBIDDEN_UNIT' };
  }

  if ((rep as any).status === 'PENDING' || (rep as any).status === 'APPROVED') {
    return { ok: false, code: 403 as const, msg: 'REPORT_LOCKED' };
  }

  const repDate = new Date((rep as any).date);
  if (isSameDayUTC(repDate, todayDateOnly()) && isAfterCutoff()) {
    return { ok: false, code: 403 as const, msg: 'AFTER_CUTOFF' };
  }

  return { ok: true, rep };
}

/* ================= PDF helpers (LAYOUT si mock) ================= */

function safeText(v: any) {
  return String(v ?? '').trim();
}

function formatDateISO(d?: any) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function getLogos() {
  const leftLogo = path.join(process.cwd(), 'uploads', 'assets', 'logo-left.png');
  const rightLogo = path.join(process.cwd(), 'uploads', 'assets', 'logo-right.png');
  return {
    left: fs.existsSync(leftLogo) ? leftLogo : null,
    right: fs.existsSync(rightLogo) ? rightLogo : null,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function drawOuterFrame(doc: PDFKit.PDFDocument, margin: number) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save();
  doc.lineWidth(1);
  doc.strokeColor('#111');
  doc.rect(margin, margin, w - margin * 2, h - margin * 2).stroke();
  doc.restore();
}

/**
 * IMPORTANT:
 * pdfkit e ndryshon doc.y pas doc.text().
 * Këtu e vizatojmë tekstin pa e prish doc.y (restore).
 */
function drawTextFixed(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { align?: 'left' | 'center' | 'right'; font?: string; size?: number; color?: string; bold?: boolean }
) {
  const align = opts?.align ?? 'left';
  const size = opts?.size ?? 10;
  const color = opts?.color ?? '#111';
  const font = opts?.font ?? (opts?.bold ? 'Times-Bold' : 'Times-Roman');

  const prevY = doc.y;
  const prevX = doc.x;

  doc.font(font).fontSize(size).fillColor(color);

  const padX = 6;
  const padY = 5;

  const innerW = Math.max(1, w - padX * 2);
  const innerX = x + padX;

  const th = doc.heightOfString(text || ' ', { width: innerW, align });
  const ty = y + padY + clamp((h - padY * 2 - th) / 2, 0, 999);

  doc.text(text || '', innerX, ty, { width: innerW, align });

  doc.x = prevX;
  doc.y = prevY;
}

function drawBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: string; stroke?: string; lineWidth?: number }
) {
  doc.save();
  doc.lineWidth(opts?.lineWidth ?? 1);
  if (opts?.fill) {
    doc.fillColor(opts.fill).rect(x, y, w, h).fill();
  }
  doc.strokeColor(opts?.stroke ?? '#111').rect(x, y, w, h).stroke();
  doc.restore();
}

/** Logo i qendruar REAL brenda katrorit */
function drawImageCenteredInBox(
  doc: PDFKit.PDFDocument,
  imagePath: string,
  box: { x: number; y: number; w: number; h: number },
  padding = 6
) {
  try {
    const img = (doc as any).openImage(imagePath);
    const iw = img.width;
    const ih = img.height;

    const availW = Math.max(1, box.w - padding * 2);
    const availH = Math.max(1, box.h - padding * 2);

    const scale = Math.min(availW / iw, availH / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    const dx = box.x + (box.w - dw) / 2;
    const dy = box.y + (box.h - dh) / 2;

    doc.image(imagePath, dx, dy, { width: dw, height: dh });
  } catch {
    // ignore
  }
}

function drawTopHeaderMock(
  doc: PDFKit.PDFDocument,
  ctx: {
    contentMargin: number;
    logoPath?: string | null;
    title: string;
    metaLine: string;
  }
) {
  const { contentMargin, logoPath, title, metaLine } = ctx;

  const pageW = doc.page.width;
  const x0 = contentMargin;
  const y0 = contentMargin;
  const w0 = pageW - contentMargin * 2;

  const headerH = 90;

  drawBox(doc, x0, y0, w0, headerH, { stroke: '#111' });

  // logo box majtas
  const logoBox = { x: x0 + 14, y: y0 + 14, w: 70, h: 62 };
  drawBox(doc, logoBox.x, logoBox.y, logoBox.w, logoBox.h, { stroke: '#111' });

  if (logoPath) {
    drawImageCenteredInBox(doc, logoPath, logoBox, 8);
  } else {
    drawTextFixed(doc, 'LOGO', logoBox.x, logoBox.y, logoBox.w, logoBox.h, { align: 'center', bold: true, size: 10 });
  }

  // titulli + meta djathtas
  const tx = logoBox.x + logoBox.w + 16;
  const tw = x0 + w0 - 14 - tx;

  drawTextFixed(doc, title, tx, y0 + 18, tw, 26, { align: 'left', bold: true, size: 18 });
  drawTextFixed(doc, metaLine, tx, y0 + 48, tw, 20, { align: 'left', size: 10 });

  // vijë poshtë header-it
  doc.save();
  doc.strokeColor('#111').lineWidth(1);
  doc.moveTo(x0, y0 + headerH).lineTo(x0 + w0, y0 + headerH).stroke();
  doc.restore();

  return { headerBottomY: y0 + headerH };
}

function drawSummaryRow(
  doc: PDFKit.PDFDocument,
  ctx: {
    contentMargin: number;
    y: number;
    boxes: Array<{ label: string; value: string }>;
  }
) {
  const { contentMargin, y, boxes } = ctx;

  const x0 = contentMargin;
  const w0 = doc.page.width - contentMargin * 2;

  const sectionH = 86;

  drawTextFixed(doc, 'Përmbledhje', x0, y + 10, w0, 20, { bold: true, size: 12 });

  const boxY = y + 36;
  const boxH = 44;

  const innerPad = 10;
  const innerX = x0 + innerPad;
  const innerW = w0 - innerPad * 2;

  const gap = 12;
  const boxW = (innerW - gap * (boxes.length - 1)) / boxes.length;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const bx = innerX + i * (boxW + gap);

    drawBox(doc, bx, boxY, boxW, boxH, { stroke: '#111' });
    drawTextFixed(doc, b.label, bx, boxY + 6, boxW, 18, { size: 9, color: '#111' });
    drawTextFixed(doc, b.value, bx, boxY + 22, boxW, 18, { bold: true, size: 16 });
  }

  doc.save();
  doc.strokeColor('#111').lineWidth(1);
  doc.moveTo(x0, y + sectionH).lineTo(x0 + w0, y + sectionH).stroke();
  doc.restore();

  return { summaryBottomY: y + sectionH };
}

type TableCol = { key: string; header: string; baseW: number; align?: 'left' | 'center' | 'right' };

function computeColWidths(contentW: number, cols: TableCol[]) {
  const baseTotal = cols.reduce((s, c) => s + c.baseW, 0);
  const scale = contentW / baseTotal;
  const widths = cols.map((c) => Math.round(c.baseW * scale));

  const diff = contentW - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += diff;

  return widths;
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, widths: number[], cols: TableCol[]) {
  const h = 28;

  doc.save();
  doc.fillColor('#f1f3f4').rect(x, y, widths.reduce((a, b) => a + b, 0), h).fill();
  doc.restore();

  doc.save();
  doc.strokeColor('#111').lineWidth(1);
  doc.rect(x, y, widths.reduce((a, b) => a + b, 0), h).stroke();
  doc.restore();

  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const w = widths[i];

    if (i > 0) {
      doc.save();
      doc.strokeColor('#111').lineWidth(1);
      doc.moveTo(cx, y).lineTo(cx, y + h).stroke();
      doc.restore();
    }

    drawTextFixed(doc, cols[i].header, cx, y, w, h, { bold: true, size: 10, align: cols[i].align ?? 'left' });
    cx += w;
  }

  return { headerH: h };
}

function drawTableRow(doc: PDFKit.PDFDocument, x: number, y: number, widths: number[], cols: TableCol[], values: string[]) {
  const pad = 10;
  let rowH = 26;

  for (let i = 0; i < cols.length; i++) {
    const w = widths[i];
    const text = safeText(values[i] ?? '');
    const prevY = doc.y;
    doc.font('Times-Roman').fontSize(10);
    const th = doc.heightOfString(text || ' ', { width: Math.max(1, w - pad) });
    doc.y = prevY;
    rowH = Math.max(rowH, th + 14);
  }

  doc.save();
  doc.strokeColor('#111').lineWidth(0.8);
  doc.rect(x, y, widths.reduce((a, b) => a + b, 0), rowH).stroke();
  doc.restore();

  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const w = widths[i];

    if (i > 0) {
      doc.save();
      doc.strokeColor('#111').lineWidth(0.8);
      doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
      doc.restore();
    }

    drawTextFixed(doc, safeText(values[i] ?? ''), cx, y, w, rowH, { size: 10, align: cols[i].align ?? 'left' });
    cx += w;
  }

  return { rowH };
}

function drawFooter(doc: PDFKit.PDFDocument, contentMargin: number, pageNo: number, pageCount?: number) {
  const x0 = contentMargin;
  const w0 = doc.page.width - contentMargin * 2;
  const y = doc.page.height - contentMargin - 26;

  doc.save();
  doc.strokeColor('#111').lineWidth(1);
  doc.moveTo(x0, y).lineTo(x0 + w0, y).stroke();
  doc.restore();

  drawTextFixed(doc, '© 2026 FSK • Sistemi i menaxhimit', x0, y + 6, w0 * 0.7, 18, { size: 9, align: 'left' });

  const right = pageCount ? `Faqe ${pageNo} / ${pageCount}` : `Faqe ${pageNo}`;
  drawTextFixed(doc, right, x0 + w0 * 0.7, y + 6, w0 * 0.3, 18, { size: 9, align: 'right' });
}

/* ============ LIST ============ */

r.get(
  '/',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const { date, unit, personId } = req.query as any;

    const q: any = {};
    const user: any = (req as any).user;

    if (date) q.date = new Date(date);

    if (user.role !== 'ADMIN') {
      if (!user.unitId) return res.status(403).json({ code: 'NO_UNIT_ASSIGNED' });
      q.unitId = user.unitId;
    } else if (unit) {
      const uid = await resolveUnitId(String(unit));
      if (uid) q.unitId = uid;
    }

    // ✅ populate unitId -> Unit, dhe kthe edhe unit: {id,code,name}
    const itemsRaw = await DailyReport.find(q)
      .sort({ date: -1 })
      .limit(100)
      .populate('unitId', '_id code name')
      .lean();

    // ✅ nëse filtron me personId, e bëjmë mbi listën e filtruar
    let items = itemsRaw;

    if (personId && isObjectId(String(personId))) {
      const ids = items.map((i) => (i as any)._id);
      const rows = await Justification.find({ reportId: { $in: ids }, personId }).select('reportId').lean();
      const set = new Set(rows.map((r) => String((r as any).reportId)));
      items = items.filter((i) => set.has(String((i as any)._id)));
    }

    // ✅ normalizo output: unitId mbetet, por shtojmë unit për UI
    const out = items.map((it: any) => {
      const u = it.unitId && typeof it.unitId === 'object'
        ? { id: String(it.unitId._id), code: it.unitId.code, name: it.unitId.name }
        : null;

      return {
        ...it,
        unitId: u ? u.id : it.unitId,
        unit: u, // ✅ frontend shfaq unit.code/name
      };
    });

    return res.json(out);
  }
);

/* ============ CREATE ============ */

r.post(
  '/',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'ADMIN'),
  async (req: any, res) => {
    const { date, unitId } = req.body ?? {};
    if (!date || !unitId) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'date & unitId required' });
    }

    const user: any = req.user;
    const uid = await resolveUnitId(String(unitId));
    if (!uid) return res.status(400).json({ code: 'UNIT_NOT_FOUND' });

    if (user.role !== 'ADMIN') {
      if (!user.unitId || String(user.unitId) !== String(uid)) {
        return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
      }
    }

    try {
      const item = await DailyReport.create({
        date,
        unitId: uid,
        createdBy: user?.id ?? null,
      });

      // ✅ kthe edhe unit brief
      const unitBrief = await getUnitBrief(uid);
      return res.status(201).json({
        ...(item.toObject ? item.toObject() : item),
        unit: unitBrief,
      });
    } catch (e: any) {
      if (e.code === 11000) return res.status(409).json({ code: 'CONFLICT', message: 'Report exists' });
      throw e;
    }
  }
);

/* ============ GET by id (me rreshta) ============ */

r.get(
  '/:id',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;

    // ✅ populate unitId
    const item = await DailyReport.findById(req.params.id)
      .populate('unitId', '_id code name')
      .lean();

    if (!item) return res.status(404).json({ code: 'NOT_FOUND' });

    // item.unitId mund të jetë objekt (populated)
    const unitIdRaw = (item as any).unitId?._id ?? (item as any).unitId;

    if (!sameUnit(user, unitIdRaw)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    const rows = await Justification.find({ reportId: (item as any)._id })
      .populate('personId', 'serviceNo firstName lastName')
      .populate('categoryId', 'code label')
      .lean();

    const uObj = (item as any).unitId && typeof (item as any).unitId === 'object'
      ? { id: String((item as any).unitId._id), code: (item as any).unitId.code, name: (item as any).unitId.name }
      : null;

    return res.json({
      ...item,
      unitId: uObj ? uObj.id : (item as any).unitId,
      unit: uObj,
      rows,
    });
  }
);

/* ============ ADD row ============ */

r.post(
  '/:id/rows',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'ADMIN'),
  async (req, res) => {
    const { personId, categoryId } = req.body ?? {};
    if (!personId || !categoryId) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'personId & categoryId required' });
    }

    const user: any = (req as any).user;

    const rep = await DailyReport.findById(req.params.id);
    if (!rep) return res.status(404).json({ code: 'NOT_FOUND', message: 'report' });

    if (!sameUnit(user, (rep as any).unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    const lock = await ensureReportEditable(String((rep as any)._id), user);
    if (!lock.ok) return res.status(lock.code ?? 403).json({ code: lock.msg });

    const needPer = await needsPeriod(String(categoryId));
    const todayStr = new Date().toISOString().slice(0, 10);

    let { from, to, location, notes, emergency } = req.body ?? {};
    emergency = !!emergency;

    if (emergency) {
      from = todayStr;
      to = todayStr;
    }

    if (needPer && !emergency) {
      if (from?.slice?.(0, 10) === todayStr || to?.slice?.(0, 10) === todayStr) {
        return res.status(400).json({
          code: 'PERIOD_INVALID_TODAY',
          message: 'Kjo kategori s’mund të nis sot (pa emergjencë).',
        });
      }
    }

    const row = await Justification.create({
      reportId: (rep as any)._id,
      personId,
      categoryId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      location,
      notes,
      emergency,
    });

    const populated = await Justification.findById((row as any)._id)
      .populate('personId', 'serviceNo firstName lastName')
      .populate('categoryId', 'code label')
      .lean();

    res.status(201).json(populated);
  }
);

/* ============ UPDATE row ============ */

r.put(
  '/rows/:rowId',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'ADMIN'),
  async (req, res) => {
    const existing = await Justification.findById(req.params.rowId).lean();
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND' });

    const user: any = (req as any).user;

    const lock = await ensureReportEditable(String((existing as any).reportId), user);
    if (!lock.ok) return res.status(lock.code ?? 403).json({ code: lock.msg });

    const update: any = { ...req.body };
    const catId = String(update.categoryId ?? (existing as any).categoryId);

    const needPer = await needsPeriod(catId);
    const todayStr = new Date().toISOString().slice(0, 10);

    if (update.emergency === true || (existing as any).emergency === true) {
      update.emergency = true;
      update.from = new Date(todayStr);
      update.to = new Date(todayStr);
    } else {
      if (update.from) update.from = new Date(update.from);
      if (update.to) update.to = new Date(update.to);

      if (needPer && !update.emergency) {
        const f = update.from
          ? update.from.toISOString().slice(0, 10)
          : (existing as any).from
            ? new Date((existing as any).from).toISOString().slice(0, 10)
            : null;

        const t = update.to
          ? update.to.toISOString().slice(0, 10)
          : (existing as any).to
            ? new Date((existing as any).to).toISOString().slice(0, 10)
            : null;

        if (f === todayStr || t === todayStr) {
          return res.status(400).json({
            code: 'PERIOD_INVALID_TODAY',
            message: 'Kjo kategori s’mund të nis sot (pa emergjencë).',
          });
        }
      }
    }

    const row = await Justification.findByIdAndUpdate(req.params.rowId, update, { new: true })
      .populate('personId', 'serviceNo firstName lastName')
      .populate('categoryId', 'code label')
      .lean();

    res.json(row);
  }
);

/* ============ DELETE row ============ */

r.delete(
  '/rows/:rowId',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'ADMIN'),
  async (req, res) => {
    const existing = await Justification.findById(req.params.rowId).lean();
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND' });

    const user: any = (req as any).user;

    const lock = await ensureReportEditable(String((existing as any).reportId), user);
    if (!lock.ok) return res.status(lock.code ?? 403).json({ code: lock.msg });

    const row = await Justification.findByIdAndDelete(req.params.rowId);
    if (!row) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json({ ok: true });
  }
);

/* ============ WORKFLOW: SUBMIT / APPROVE / REJECT ============ */

r.post(
  '/:id/submit',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'ADMIN'),
  async (req, res) => {
    const user: any = (req as any).user;

    const rep = await DailyReport.findById(req.params.id).lean();
    if (!rep) return res.status(404).end();

    if (!sameUnit(user, (rep as any).unitId)) return res.status(403).json({ code: 'FORBIDDEN_UNIT' });

    if (isSameDayUTC(new Date((rep as any).date), todayDateOnly()) && isAfterCutoff()) {
      return res.status(403).json({ code: 'AFTER_CUTOFF' });
    }

    if ((rep as any).status !== 'DRAFT') return res.status(400).json({ code: 'INVALID_STATE' });

    (rep as any).status = 'PENDING';
    await DailyReport.findByIdAndUpdate((rep as any)._id, rep);

    res.json(rep);
  }
);

r.post(
  '/:id/approve',
  requireAuth,
  requireRole('COMMANDER', 'ADMIN'),
  async (req: any, res) => {
    const user: any = req.user;

    const rep = await DailyReport.findById(req.params.id).lean();
    if (!rep) return res.status(404).end();

    if (!sameUnit(user, (rep as any).unitId)) return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    if ((rep as any).status !== 'PENDING') return res.status(400).json({ code: 'INVALID_STATE' });

    (rep as any).status = 'APPROVED';
    (rep as any).approvedBy = user?.id ?? null;
    (rep as any).approvedAt = new Date();
    (rep as any).reviewComment = req.body?.comment ?? '';

    await DailyReport.findByIdAndUpdate((rep as any)._id, rep);
    res.json(rep);
  }
);

r.post(
  '/:id/reject',
  requireAuth,
  requireRole('COMMANDER', 'ADMIN'),
  async (req: any, res) => {
    const user: any = req.user;

    const rep = await DailyReport.findById(req.params.id).lean();
    if (!rep) return res.status(404).end();

    if (!sameUnit(user, (rep as any).unitId)) return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    if ((rep as any).status !== 'PENDING') return res.status(400).json({ code: 'INVALID_STATE' });

    (rep as any).status = 'REJECTED';
    (rep as any).approvedBy = user?.id ?? null;
    (rep as any).approvedAt = new Date();
    (rep as any).reviewComment = req.body?.comment ?? '';

    await DailyReport.findByIdAndUpdate((rep as any)._id, rep);
    res.json(rep);
  }
);

/* ============ helpers për export ============ */

async function getReportWithRows(id: string) {
  const rep = await DailyReport.findById(id).lean();
  if (!rep) return null;

  const rows = await Justification.find({ reportId: (rep as any)._id })
    .populate('personId', 'serviceNo firstName lastName')
    .populate('categoryId', 'code label')
    .lean();

  return { rep, rows };
}

/* ============ Export PDF (UPDATE: logo center + cards inset + E column visible) ============ */

r.get(
  '/:id/export/pdf',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;

    const data = await getReportWithRows(req.params.id);
    if (!data) return res.status(404).end();

    const { rep, rows } = data;

    if (!sameUnit(user, (rep as any).unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    const unitDoc = await Unit.findById((rep as any).unitId).select('code name').lean();
    const unitLabel = unitDoc
      ? `${safeText((unitDoc as any).code) ? safeText((unitDoc as any).code) + ' • ' : ''}${safeText((unitDoc as any).name)}`
      : safeText((rep as any).unitId);

    const reportDate = formatDateISO((rep as any).date);
    const status = safeText((rep as any).status) || 'DRAFT';

    const emergencies = rows.filter((r: any) => !!r.emergency).length;
    const leaves = rows.filter((r: any) => {
      const c = r.categoryId as any;
      const code = safeText(c?.code);
      return ['01-12', '01-13'].includes(code);
    }).length;

    const total = rows.length;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="raport-${(rep as any)._id}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);

    const frameMargin = 36;
    const innerPaddingFromFrame = 14; // ✅ çdo element mos me u ngjit te borderi kryesor
    const contentMargin = frameMargin + innerPaddingFromFrame;

    const logos = getLogos();

    const title = 'Raport Ditor';
    const metaLine = `Data: ${reportDate}   •   Njësia: ${unitLabel}   •   Status: ${status}`;

    // ✅ e rrisim pak kolonën E, dhe e ngushtojmë pak “Shënime” që mos me humb
    const cols: TableCol[] = [
      { key: 'idx', header: '#', baseW: 28, align: 'center' },
      { key: 'sn', header: 'Nr. Shërbimit', baseW: 92 },
      { key: 'name', header: 'Emri & Mbiemri', baseW: 158 },
      { key: 'cat', header: 'Kategoria', baseW: 138 },
      { key: 'from', header: 'Nga', baseW: 70, align: 'center' },
      { key: 'to', header: 'Deri', baseW: 70, align: 'center' },
      { key: 'loc', header: 'Vend', baseW: 88 },
      { key: 'notes', header: 'Shënime', baseW: 84 }, // pak ma ngusht
      { key: 'emg', header: 'E', baseW: 40, align: 'center' }, // ✅ ma e gjerë, shihet mirë
    ];

    const contentW = doc.page.width - contentMargin * 2;
    const colWidths = computeColWidths(contentW, cols);

    let pageNo = 1;

    const startNewPage = () => {
      if (pageNo > 1) doc.addPage();

      drawOuterFrame(doc, frameMargin);

      const { headerBottomY } = drawTopHeaderMock(doc, {
        contentMargin,
        logoPath: logos.left,
        title,
        metaLine,
      });

      const { summaryBottomY } = drawSummaryRow(doc, {
        contentMargin,
        y: headerBottomY,
        boxes: [
          { label: 'Rreshta', value: String(total) },
          { label: 'Emergjenca', value: String(emergencies) },
          { label: 'Pushime', value: String(leaves) },
          { label: 'Total', value: String(total) },
        ],
      });

      return { tableStartY: summaryBottomY + 16 };
    };

    let { tableStartY } = startNewPage();
    let cursorY = tableStartY;

    const tableX = contentMargin;
    const { headerH } = drawTableHeader(doc, tableX, cursorY, colWidths, cols);
    cursorY += headerH;

    const footerReserve = 42;
    const maxY = doc.page.height - contentMargin - footerReserve;

    doc.font('Times-Roman').fontSize(10).fillColor('#111');

    for (let i = 0; i < rows.length; i++) {
      const rw: any = rows[i];
      const p = rw.personId || {};
      const c = rw.categoryId || {};

      const sn = safeText(p.serviceNo);
      const name = `${safeText(p.firstName)} ${safeText(p.lastName)}`.trim();
      const cat = `${safeText(c.code)} • ${safeText(c.label)}`.trim();

      const from = rw.from ? formatDateISO(rw.from) : '';
      const to = rw.to ? formatDateISO(rw.to) : '';
      const loc = safeText(rw.location);
      const notes = safeText(rw.notes);
      const emg = rw.emergency ? 'E' : '';

      const values = [String(i + 1), sn, name, cat, from, to, loc, notes, emg];

      let estimateH = 26;
      for (let k = 0; k < cols.length; k++) {
        const w = colWidths[k];
        const txt = safeText(values[k] ?? '');
        const prevY = doc.y;
        doc.font('Times-Roman').fontSize(10);
        const th = doc.heightOfString(txt || ' ', { width: Math.max(1, w - 10) });
        doc.y = prevY;
        estimateH = Math.max(estimateH, th + 14);
      }

      if (cursorY + estimateH > maxY) {
        drawFooter(doc, contentMargin, pageNo);

        pageNo += 1;
        ({ tableStartY } = startNewPage());
        cursorY = tableStartY;

        const hh = drawTableHeader(doc, tableX, cursorY, colWidths, cols).headerH;
        cursorY += hh;
      }

      const { rowH } = drawTableRow(doc, tableX, cursorY, colWidths, cols, values);
      cursorY += rowH;
    }

    drawFooter(doc, contentMargin, pageNo);

    doc.end();
  }
);

/* ============ Export XLSX ============ */

r.get(
  '/:id/export/xlsx',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;

    const data = await getReportWithRows(req.params.id);
    if (!data) return res.status(404).end();

    const { rep, rows } = data;

    if (!sameUnit(user, (rep as any).unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Raport Ditor');

    ws.columns = [
      { header: 'Nr.', width: 5 },
      { header: 'Nr. Shërbimit', width: 15 },
      { header: 'Emri', width: 18 },
      { header: 'Mbiemri', width: 18 },
      { header: 'Kategoria', width: 28 },
      { header: 'Nga', width: 12 },
      { header: 'Deri', width: 12 },
      { header: 'Vend', width: 20 },
      { header: 'Shënime', width: 30 },
      { header: 'Emergjencë', width: 12 },
    ];

    rows.forEach((rw: any, i: number) => {
      const cat = (rw.categoryId as any);
      ws.addRow([
        i + 1,
        rw.personId?.serviceNo,
        rw.personId?.firstName,
        rw.personId?.lastName,
        `${cat?.code} — ${cat?.label}`,
        rw.from ? new Date(rw.from).toISOString().slice(0, 10) : '',
        rw.to ? new Date(rw.to).toISOString().slice(0, 10) : '',
        rw.location ?? '',
        rw.notes ?? '',
        rw.emergency ? 'PO' : 'JO',
      ]);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="raport-${(rep as any)._id}.xlsx"`);

    await (wb as any).xlsx.write(res);
    res.end();
  }
);

/* ============ NEW: Upcoming leave për person ============ */

r.get(
  '/people/:id/upcoming-leave',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) return res.json([]);

    const today = new Date();

    const items = await Justification.find({
      personId: id,
      from: { $gte: today },
    })
      .populate('categoryId', 'code label')
      .lean();

    const out = items.map((j: any) => ({
      _id: String(j._id),
      categoryCode: j.categoryId?.code,
      categoryLabel: j.categoryId?.label,
      from: j.from ? new Date(j.from).toISOString() : null,
      to: j.to ? new Date(j.to).toISOString() : null,
    }));

    res.json(out);
  }
);

export default r;