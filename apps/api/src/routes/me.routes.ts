// apps/api/src/routes/me.routes.ts

import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';

import User from '../models/User';
import { requireAuth, AuthUserPayload } from '../middleware/auth';

const r = Router();

/**
 * Helper: siguro folderin uploads/signatures
 */
function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Merr DataURL/base64 dhe e kthen Buffer PNG
 * Pranon:
 *  - data:image/png;base64,....
 *  - base64 raw (pa prefix)
 */
function parsePngBase64(input: string): Buffer | null {
    const s = String(input || '').trim();
    if (!s) return null;

    let b64 = s;

    // dataURL
    if (s.startsWith('data:')) {
        const m = s.match(/^data:(image\/png);base64,(.+)$/i);
        if (!m) return null;
        b64 = m[2];
    }

    try {
        const buf = Buffer.from(b64, 'base64');
        // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
        if (buf.length < 8) return null;
        const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (!buf.subarray(0, 8).equals(pngSig)) return null;
        return buf;
    } catch {
        return null;
    }
}

/**
 * GET /api/me
 * Kthen profilin bazë + signature info (që frontendi me dit a ekziston)
 */
r.get('/', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    const user = await User.findById(me.id).lean();
    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    const u: any = user;

    return res.json({
        id: String(u._id),
        username: u.username,
        role: u.role,
        unitId: u.unitId ? String(u.unitId) : null,

        mustChangePassword: !!u.mustChangePassword,

        // ✅ signature fields
        signatureImageUrl: u.signatureImageUrl ?? null,
        signatureSignedAt: u.signatureSignedAt ?? null,
    });
});

/**
 * PUT /api/me/signature
 * Body:
 *  { dataUrl: "data:image/png;base64,..." }
 * ose { base64: "...." }
 *
 * Ruhet si file PNG në /uploads/signatures/<userId>.png
 * Dhe në DB ruhet path: /uploads/signatures/<userId>.png
 */
r.put('/signature', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    const user = await User.findById(me.id);
    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    const dataUrl = req.body?.dataUrl ?? req.body?.base64 ?? '';
    const buf = parsePngBase64(String(dataUrl));

    if (!buf) {
        return res.status(400).json({
            code: 'INVALID_SIGNATURE',
            message: 'Nënshkrimi duhet të jetë PNG (dataURL ose base64).',
        });
    }

    // limit size (p.sh. 350KB) - mjafton për një signature me transparencë
    const MAX_BYTES = 350 * 1024;
    if (buf.length > MAX_BYTES) {
        return res.status(413).json({
            code: 'SIGNATURE_TOO_LARGE',
            message: 'Nënshkrimi është shumë i madh. Provo me canvas më të vogël (p.sh. 600x200).',
        });
    }

    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const sigDir = path.join(uploadsRoot, 'signatures');
    ensureDir(sigDir);

    const filename = `${String(user._id)}.png`;
    const absPath = path.join(sigDir, filename);

    fs.writeFileSync(absPath, buf);

    // URL relative që e shërben static serveri (duhet me e pas already app.use('/uploads', express.static(...)))
    const publicUrl = `/uploads/signatures/${filename}`;

    (user as any).signatureImageUrl = publicUrl;
    (user as any).signatureSignedAt = new Date();
    await user.save();

    return res.json({
        ok: true,
        signatureImageUrl: publicUrl,
        signatureSignedAt: (user as any).signatureSignedAt,
    });
});

/**
 * DELETE /api/me/signature
 * (opsionale) për me e fshi nënshkrimin
 */
r.delete('/signature', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload;

    const user = await User.findById(me.id);
    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    const sigUrl = (user as any).signatureImageUrl as string | null;

    (user as any).signatureImageUrl = null;
    (user as any).signatureSignedAt = null;
    await user.save();

    // tentojme me fshi file-n (nëse ekziston)
    try {
        if (sigUrl && sigUrl.startsWith('/uploads/signatures/')) {
            const filename = sigUrl.replace('/uploads/signatures/', '');
            const absPath = path.join(process.cwd(), 'uploads', 'signatures', filename);
            if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        }
    } catch {
        // ignore
    }

    return res.json({ ok: true });
});

export default r;