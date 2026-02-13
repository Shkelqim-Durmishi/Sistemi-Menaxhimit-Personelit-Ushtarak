import { Router } from 'express';
import argon2 from 'argon2';
import User from '../models/User';
import { requireAuth, requireRole, AuthUserPayload } from '../middleware/auth';

const r = Router();

/**
 * GET /api/users
 * Lista e përdoruesve – vetëm ADMIN
 */
r.get(
    '/',
    requireAuth,
    requireRole('ADMIN'),
    async (_req, res) => {
        const users = await User.find({})
            .populate('unitId', 'code name')
            .sort({ username: 1 })
            .lean();

        const data = users.map((u: any) => ({
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
        }));

        res.json(data);
    }
);

/**
 * PUT /api/users/:id
 * Përditëson rolin / njësinë / password-in + kontratën + mustChangePassword
 */
r.put(
    '/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res) => {
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

        // contractValidFrom: mund të vijë si string (data) ose null → pastro fushën
        if (contractValidFrom !== undefined) {
            if (contractValidFrom === null) {
                update.contractValidFrom = null;
            } else {
                const d = new Date(contractValidFrom);
                if (!isNaN(d.getTime())) update.contractValidFrom = d;
            }
        }

        // contractValidTo: njëjtë si lart
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

        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate('unitId', 'code name')
            .lean();

        if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

        res.json({
            id: String(user._id),
            username: user.username,
            role: user.role,

            unit: (user as any).unitId
                ? {
                    id: String((user as any).unitId._id),
                    code: (user as any).unitId.code,
                    name: (user as any).unitId.name,
                }
                : null,

            // siguria
            isBlocked: !!(user as any).isBlocked,
            blockReason: (user as any).blockReason ?? '',
            failedLoginCount: (user as any).failedLoginCount ?? 0,
            lastFailedLoginAt: (user as any).lastFailedLoginAt ?? null,

            // kontrata
            contractValidFrom: (user as any).contractValidFrom ?? null,
            contractValidTo: (user as any).contractValidTo ?? null,
            neverExpires: (user as any).neverExpires ?? true,

            // detyrimi për ndryshim fjalëkalimi
            mustChangePassword: (user as any).mustChangePassword ?? false,
        });
    }
);

/**
 * PUT /api/users/:id/block
 * Bllokon user – vetëm ADMIN
 */
r.put(
    '/:id/block',
    requireAuth,
    requireRole('ADMIN'),
    async (req: any, res) => {
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

        res.json({
            id: String(user._id),
            username: user.username,
            role: user.role,
            unit: (user as any).unitId
                ? {
                    id: String((user as any).unitId._id),
                    code: (user as any).unitId.code,
                    name: (user as any).unitId.name,
                }
                : null,

            isBlocked: !!(user as any).isBlocked,
            blockReason: (user as any).blockReason ?? '',
            failedLoginCount: (user as any).failedLoginCount ?? 0,
            lastFailedLoginAt: (user as any).lastFailedLoginAt ?? null,

            // kontrata
            contractValidFrom: (user as any).contractValidFrom ?? null,
            contractValidTo: (user as any).contractValidTo ?? null,
            neverExpires: (user as any).neverExpires ?? true,

            // detyrimi për ndryshim fjalëkalimi
            mustChangePassword: (user as any).mustChangePassword ?? false,
        });
    }
);

/**
 * PUT /api/users/:id/unblock
 * Çbllokon user – ADMIN
 */
r.put(
    '/:id/unblock',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res) => {
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

        res.json({
            id: String(user._id),
            username: user.username,
            role: user.role,
            unit: (user as any).unitId
                ? {
                    id: String((user as any).unitId._id),
                    code: (user as any).unitId.code,
                    name: (user as any).unitId.name,
                }
                : null,

            isBlocked: !!(user as any).isBlocked,
            blockReason: (user as any).blockReason ?? '',
            failedLoginCount: (user as any).failedLoginCount ?? 0,
            lastFailedLoginAt: (user as any).lastFailedLoginAt ?? null,

            // kontrata
            contractValidFrom: (user as any).contractValidFrom ?? null,
            contractValidTo: (user as any).contractValidTo ?? null,
            neverExpires: (user as any).neverExpires ?? true,

            // detyrimi për ndryshim fjalëkalimi
            mustChangePassword: (user as any).mustChangePassword ?? false,
        });
    }
);

/**
 * DELETE /api/users/:id
 * Fshin user – ADMIN
 */
r.delete(
    '/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res) => {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

        res.json({ ok: true });
    }
);

export default r;