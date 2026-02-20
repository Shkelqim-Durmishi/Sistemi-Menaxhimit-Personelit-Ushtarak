// apps/api/src/routes/users.routes.ts
import { Router } from 'express';
import argon2 from 'argon2';

import User from '../models/User';
import { requireAuth, requireRole, AuthUserPayload } from '../middleware/auth';

const r = Router();

/** Helper: normalizon user për UI */
function toUserDTO(u: any) {
    return {
        id: String(u._id),
        username: u.username,
        role: u.role,

        unit: u.unitId
            ? {
                id: String(u.unitId._id),
                code: u.unitId.code,
                name: u.unitId.name,
            }
            : null,

        lastLogin: u.lastLogin ?? null,
        createdAt: u.createdAt,

        // 🔐 Siguria
        isBlocked: !!u.isBlocked,
        blockReason: u.blockReason ?? '',
        failedLoginCount: u.failedLoginCount ?? 0,
        lastFailedLoginAt: u.lastFailedLoginAt ?? null,

        // 📄 Kontrata
        contractValidFrom: u.contractValidFrom ?? null,
        contractValidTo: u.contractValidTo ?? null,
        neverExpires: u.neverExpires ?? true,

        // 🔑 Detyrimi për ndryshim fjalëkalimi
        mustChangePassword: u.mustChangePassword ?? false,

        // ✍️ Nënshkrimi digjital
        signatureImageUrl: u.signatureImageUrl ?? null,
        signatureSignedAt: u.signatureSignedAt ?? null,
    };
}

/**
 * GET /api/users
 * Lista e përdoruesve – vetëm ADMIN
 */
r.get('/', requireAuth, requireRole('ADMIN'), async (_req, res) => {
    const users = await User.find({})
        .populate('unitId', 'code name')
        .sort({ username: 1 })
        .lean();

    res.json(users.map(toUserDTO));
});

/**
 * GET /api/users/me
 * Profil i user-it të kyçur (për frontend: mustChangePassword + signature)
 */
r.get('/me', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload | undefined;
    if (!me?.id) return res.status(401).json({ code: 'UNAUTHORIZED' });

    const user = await User.findById(me.id).populate('unitId', 'code name').lean();
    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    return res.json(toUserDTO(user));
});

/**
 * PUT /api/users/me/signature
 * Vendos/ndryshon nënshkrimin digjital (DataURL PNG ose URL)
 * Body: { signatureImageUrl: string }
 */
r.put('/me/signature', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload | undefined;
    if (!me?.id) return res.status(401).json({ code: 'UNAUTHORIZED' });

    const { signatureImageUrl } = req.body ?? {};

    if (!signatureImageUrl || typeof signatureImageUrl !== 'string') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'signatureImageUrl required' });
    }

    // pranojmë:
    // - data:image/png;base64,...
    // - ose një path/url p.sh. /uploads/signatures/xyz.png
    const ok =
        signatureImageUrl.startsWith('data:image/png;base64,') ||
        signatureImageUrl.startsWith('/uploads/') ||
        signatureImageUrl.startsWith('http://') ||
        signatureImageUrl.startsWith('https://');

    if (!ok) {
        return res.status(400).json({
            code: 'INVALID_SIGNATURE_FORMAT',
            message: 'Signature must be PNG DataURL or a valid uploads URL.',
        });
    }

    const user = await User.findByIdAndUpdate(
        me.id,
        {
            signatureImageUrl,
            signatureSignedAt: new Date(),
        },
        { new: true }
    )
        .populate('unitId', 'code name')
        .lean();

    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    return res.json(toUserDTO(user));
});

/**
 * PUT /api/users/:id
 * Përditëson rolin / njësinë / password-in + kontratën + mustChangePassword + signature (opsionale)
 */
r.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const {
        role,
        unitId,
        password,

        // fushat e kontratës
        contractValidFrom,
        contractValidTo,
        neverExpires,

        // detyrimi për me ndërru password-in në login-in e ardhshëm
        mustChangePassword,

        // ✍️ signature (opsionale nga admin)
        signatureImageUrl,
    } = req.body ?? {};

    const update: any = {};

    if (role) update.role = role;
    if (unitId !== undefined) update.unitId = unitId || null;

    if (password) {
        update.passwordHash = await argon2.hash(password);
        // mustChangePassword kontrollohet nga body (admin vendos vetë)
    }

    // ===========================
    //   KONTRATA
    // ===========================
    if (typeof neverExpires === 'boolean') {
        update.neverExpires = neverExpires;
    }

    if (contractValidFrom !== undefined) {
        if (contractValidFrom === null) {
            update.contractValidFrom = null;
        } else {
            const d = new Date(contractValidFrom);
            if (!isNaN(d.getTime())) update.contractValidFrom = d;
        }
    }

    if (contractValidTo !== undefined) {
        if (contractValidTo === null) {
            update.contractValidTo = null;
        } else {
            const d = new Date(contractValidTo);
            if (!isNaN(d.getTime())) update.contractValidTo = d;
        }
    }

    // ===========================
    //   MUST_CHANGE_PASSWORD
    // ===========================
    if (typeof mustChangePassword === 'boolean') {
        update.mustChangePassword = mustChangePassword;
    }

    // ===========================
    //   SIGNATURE (opsionale)
    // ===========================
    if (signatureImageUrl !== undefined) {
        if (signatureImageUrl === null || signatureImageUrl === '') {
            update.signatureImageUrl = null;
            update.signatureSignedAt = null;
        } else if (typeof signatureImageUrl === 'string') {
            update.signatureImageUrl = signatureImageUrl;
            update.signatureSignedAt = new Date();
        }
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate('unitId', 'code name')
        .lean();

    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json(toUserDTO(user));
});

/**
 * PUT /api/users/:id/block
 * Bllokon user – vetëm ADMIN
 */
r.put('/:id/block', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
    const me = req.user as AuthUserPayload | undefined;
    const { reason } = req.body ?? {};

    if (me && String(me.id) === String(req.params.id)) {
        return res.status(400).json({
            code: 'CANNOT_BLOCK_SELF',
            message: 'Nuk mund ta bllokoni llogarinë tuaj.',
        });
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        {
            isBlocked: true,
            blockReason: reason || 'Blocked by admin',
        },
        { new: true }
    )
        .populate('unitId', 'code name')
        .lean();

    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json(toUserDTO(user));
});

/**
 * PUT /api/users/:id/unblock
 * Çbllokon user – ADMIN
 */
r.put('/:id/unblock', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.id,
        {
            isBlocked: false,
            blockReason: '',
            failedLoginCount: 0,
            lastFailedLoginAt: null,
        },
        { new: true }
    )
        .populate('unitId', 'code name')
        .lean();

    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json(toUserDTO(user));
});

/**
 * DELETE /api/users/:id
 * Fshin user – ADMIN
 */
r.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json({ ok: true });
});

export default r;