// apps/api/src/routes/meta.routes.ts
import { Router } from 'express';
import { Types } from 'mongoose';

import DailyReport from '../models/DailyReport';
import Justification from '../models/Justification';
import Person from '../models/Person';
import Category from '../models/Category';

import { requireAuth, type RequestWithUser } from '../middleware/auth';

const r = Router();

function startOfDay(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}

function safeObjId(v: any): Types.ObjectId | null {
    try {
        if (!v) return null;
        if (v instanceof Types.ObjectId) return v;
        const s = String(v);
        return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
    } catch {
        return null;
    }
}

function getScope(req: RequestWithUser) {
    const isAdmin = req.user?.role === 'ADMIN';
    const unitId = !isAdmin ? safeObjId(req.user?.unitId) : null;
    return { isAdmin, unitId };
}

/* =====================================================
   SUMMARY (FIXED)
   - respects role/unit scope (non-admin => unit-only)
   - uses date range for "today" (safer than equality)
===================================================== */
r.get('/summary', requireAuth, async (req, res) => {
    const rreq = req as RequestWithUser;
    const { unitId } = getScope(rreq);

    const today0 = startOfDay(new Date());
    const tomorrow0 = startOfDay(addDays(today0, 1));

    const matchReportToday: any = { date: { $gte: today0, $lt: tomorrow0 } };
    const matchReportAll: any = {};
    const matchPeople: any = {};
    if (unitId) {
        matchReportToday.unitId = unitId;
        matchReportAll.unitId = unitId;
        matchPeople.unitId = unitId;
    }

    const reportsToday = await DailyReport.countDocuments(matchReportToday);
    const reportsPending = await DailyReport.countDocuments({ ...matchReportAll, status: 'PENDING' });

    const todays = await DailyReport.find(matchReportToday).select('_id').lean();
    const ids = todays.map((x: any) => x._id);

    const rowsToday = ids.length ? await Justification.countDocuments({ reportId: { $in: ids } }) : 0;

    // Nese don me numeru veç aktivët, mundesh me bo { status:'ACTIVE' }
    const totalPeople = await Person.countDocuments(matchPeople);

    res.json({
        totalPeople,
        reportsPending,
        reportsToday,
        rowsToday,
        date: today0.toISOString().slice(0, 10),
        unitId: unitId ? String(unitId) : null,
    });
});

/* =====================================================
   CHARTS (IMPROVED)
   - uses report.date for 7-day trend + top cats/locations
   - respects unit scope (non-admin => unit-only)
===================================================== */
r.get('/charts', requireAuth, async (req, res) => {
    const rreq = req as RequestWithUser;
    const { unitId } = getScope(rreq);

    // 7 ditë: (sot + 6 mbrapa)
    const today = startOfDay(new Date());
    const start = startOfDay(addDays(today, -6)); // inclusive
    const end = startOfDay(addDays(today, 1)); // exclusive

    // Base match për raportet në range
    const matchReportRange: any = { date: { $gte: start, $lt: end } };
    if (unitId) matchReportRange.unitId = unitId;

    /* ---------- A) Reports trend (7 days): total + pending */
    const reportTrendAgg = await DailyReport.aggregate([
        { $match: matchReportRange },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                reports: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
                approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
                draft: { $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const reportPointsMap = new Map<
        string,
        {
            date: string;
            reports: number;
            pending: number;
            approved: number;
            rejected: number;
            draft: number;
        }
    >();

    for (const row of reportTrendAgg) {
        reportPointsMap.set(String(row._id), {
            date: String(row._id),
            reports: Number(row.reports || 0),
            pending: Number(row.pending || 0),
            approved: Number(row.approved || 0),
            rejected: Number(row.rejected || 0),
            draft: Number(row.draft || 0),
        });
    }

    const reportTrend: Array<{
        date: string;
        reports: number;
        pending: number;
        approved: number;
        rejected: number;
        draft: number;
    }> = [];

    for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const key = d.toISOString().slice(0, 10);
        reportTrend.push(
            reportPointsMap.get(key) ?? {
                date: key,
                reports: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                draft: 0,
            }
        );
    }

    /* ---------- B) Justifications trend (7 days) by report.date */
    const justTrendAgg = await Justification.aggregate([
        {
            $lookup: {
                from: 'dailyreports', // default plural for model DailyReport
                localField: 'reportId',
                foreignField: '_id',
                as: 'report',
            },
        },
        { $unwind: '$report' },
        { $match: { 'report.date': { $gte: start, $lt: end } } },
        ...(unitId ? [{ $match: { 'report.unitId': unitId } }] : []),
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$report.date' } },
                rows: { $sum: 1 },
                emergency: { $sum: { $cond: ['$emergency', 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const rowsMap = new Map<string, { date: string; rows: number; emergency: number }>();
    for (const row of justTrendAgg) {
        rowsMap.set(String(row._id), {
            date: String(row._id),
            rows: Number(row.rows || 0),
            emergency: Number(row.emergency || 0),
        });
    }

    const justificationTrend: Array<{ date: string; rows: number; emergency: number }> = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const key = d.toISOString().slice(0, 10);
        justificationTrend.push(rowsMap.get(key) ?? { date: key, rows: 0, emergency: 0 });
    }

    /* ---------- C) Top Categories (7 days) + lookup Category */
    const topCategories = await Justification.aggregate([
        {
            $lookup: {
                from: 'dailyreports',
                localField: 'reportId',
                foreignField: '_id',
                as: 'report',
            },
        },
        { $unwind: '$report' },
        { $match: { 'report.date': { $gte: start, $lt: end } } },
        ...(unitId ? [{ $match: { 'report.unitId': unitId } }] : []),

        {
            $group: {
                _id: '$categoryId',
                count: { $sum: 1 },
                emergency: { $sum: { $cond: ['$emergency', 1, 0] } },
            },
        },
        { $sort: { count: -1 } },
        { $limit: 7 },

        {
            $lookup: {
                from: 'categories',
                localField: '_id',
                foreignField: '_id',
                as: 'cat',
            },
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },

        {
            $project: {
                _id: 0,
                id: '$_id',
                count: 1,
                emergency: 1,
                code: '$cat.code',
                label: '$cat.label',
            },
        },
    ]);

    /* ---------- D) Top Locations (7 days) */
    const topLocations = await Justification.aggregate([
        {
            $lookup: {
                from: 'dailyreports',
                localField: 'reportId',
                foreignField: '_id',
                as: 'report',
            },
        },
        { $unwind: '$report' },
        { $match: { 'report.date': { $gte: start, $lt: end } } },
        ...(unitId ? [{ $match: { 'report.unitId': unitId } }] : []),

        {
            $match: {
                location: { $ne: null },
            },
        },

        {
            $group: {
                _id: { $toLower: { $trim: { input: '$location' } } },
                count: { $sum: 1 },
            },
        },
        { $match: { _id: { $ne: '' } } },
        { $sort: { count: -1 } },
        { $limit: 7 },
        { $project: { _id: 0, location: '$_id', count: 1 } },
    ]);

    /* ---------- E) People by status (scoped) */
    const peopleByStatus = await Person.aggregate([
        ...(unitId ? [{ $match: { unitId } }] : []),
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
        { $sort: { count: -1 } },
    ]);

    /* ---------- F) Reports by status (all-time, scoped) */
    const reportsByStatus = await DailyReport.aggregate([
        ...(unitId ? [{ $match: { unitId } }] : []),
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
        { $sort: { count: -1 } },
    ]);

    res.json({
        range: { start: start.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) },
        unitId: unitId ? String(unitId) : null,

        reportTrend,
        justificationTrend,

        topCategories,
        topLocations,

        peopleByStatus,
        reportsByStatus,
    });
});

export default r;