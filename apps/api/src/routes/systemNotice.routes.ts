import { Router } from 'express';
import SystemNotice from '../models/SystemNotice';

const router = Router();

// ✅ PUBLIC: front e lexon
// GET /api/system-notice
router.get('/', async (req, res) => {
    const doc = await SystemNotice.findOne().sort({ updatedAt: -1 }).lean();
    if (!doc) return res.json({ enabled: false });
    return res.json(doc);
});

// ✅ ADMIN: ruan notice
// PUT /api/system-notice
router.put('/', async (req, res) => {
    // këtu zakonisht vendoset auth middleware (p.sh. requireAdmin)
    const { enabled, severity, title, message } = req.body || {};

    const saved = await SystemNotice.findOneAndUpdate(
        {},
        {
            enabled: !!enabled,
            severity: severity ?? 'info',
            title: title ?? '',
            message: message ?? '',
        },
        { new: true, upsert: true }
    ).lean();

    res.json(saved);
});

export default router;