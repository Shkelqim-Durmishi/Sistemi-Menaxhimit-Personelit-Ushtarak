import { Router } from 'express';
import Category from '../models/Category';
import { requireAuth } from '../middleware/auth'; // ⬅️ SHTO KËTË

const r = Router();

r.get('/', requireAuth, async (_req, res) => { // ⬅️ EDHE KËTU
    try {
        const items = await Category.find({ active: true }).sort({ code: 1 }).lean();
        res.json(items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ code: 'SERVER_ERROR' });
    }
});

export default r;
