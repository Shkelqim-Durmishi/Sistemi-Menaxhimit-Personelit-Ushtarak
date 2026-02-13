import { Router } from 'express';
import LoginAudit from '../models/LoginAudit';
import { requireAuth, requireRole } from '../middleware/auth';

const r = Router();

/**
 * GET /api/login-audit
 * Vetëm ADMIN e sheh listën e login/logout
 *
 * Filtrimet:
 * ?page=1&limit=50
 * ?from=2025-01-01
 * ?to=2025-01-31
 * ?type=LOGIN / LOGOUT / INVALID_PASSWORD / AUTO_BLOCK
 * ?username=admin
 */
r.get(
    '/',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res) => {
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

        /** === Filtrimi dinamik === */
        const filter: any = {};

        // filtrimi sipas tipit të eventit
        if (req.query.type) {
            const allowedTypes = ['LOGIN', 'LOGOUT', 'INVALID_PASSWORD', 'AUTO_BLOCK'];
            const t = String(req.query.type).toUpperCase();
            if (allowedTypes.includes(t)) {
                filter.type = t;
            }
        }

        // filtrimi sipas username (contains, case-insensitive)
        if (req.query.username) {
            filter.username = new RegExp(String(req.query.username), 'i');
        }

        // filtrimi sipas datës (interval mbi createdAt)
        if (req.query.from || req.query.to) {
            filter.createdAt = {};

            if (req.query.from) {
                // nga fillimi i dites (UTC)
                filter.createdAt.$gte = new Date(String(req.query.from) + 'T00:00:00Z');
            }
            if (req.query.to) {
                // deri në fund të ditës (UTC)
                filter.createdAt.$lte = new Date(String(req.query.to) + 'T23:59:59Z');
            }
        }

        const [items, total] = await Promise.all([
            LoginAudit.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('unitId', 'code name')
                .lean(),

            LoginAudit.countDocuments(filter)
        ]);

        const mapped = items.map((log: any) => ({
            id: String(log._id),
            userId: log.userId ? String(log.userId) : null,
            username: log.username,
            role: log.role,
            unit: log.unitId
                ? {
                    id: String(log.unitId._id),
                    code: log.unitId.code,
                    name: log.unitId.name,
                }
                : null,
            // tani mbështet të gjitha tipet
            type: log.type as 'LOGIN' | 'LOGOUT' | 'INVALID_PASSWORD' | 'AUTO_BLOCK',
            ip: log.ip || '',
            userAgent: log.userAgent || '',
            at: log.createdAt ? new Date(log.createdAt).toISOString() : '',
        }));

        res.json({
            items: mapped,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        });
    }
);

export default r;