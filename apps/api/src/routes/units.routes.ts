import { Router } from 'express';
import Unit from '../models/Unit';
import { requireAuth } from '../middleware/auth';

const r = Router();

/**
 * GET /api/units
 * Lista e njësive – për çdo përdorues të kyçur
 * (përdoret p.sh. për dropdown në User Management)
 */
r.get(
    '/',
    requireAuth,
    async (_req, res) => {
        const items = await Unit.find({})
            .sort({ code: 1 })
            .lean();

        const data = items.map((u: any) => ({
            id: String(u._id),
            code: u.code,
            name: u.name,
        }));

        res.json(data);
    }
);

export default r;
