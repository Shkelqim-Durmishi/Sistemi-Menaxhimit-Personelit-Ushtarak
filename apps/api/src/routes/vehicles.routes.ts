import { Router } from 'express';
import Vehicle from '../models/Vehicle';
import VehicleLocation from '../models/VehicleLocation';
import { requireAuth, AuthUserPayload, requireRole } from '../middleware/auth';

const r = Router();

function canSeeAll(role: string) {
    return role === 'ADMIN' || role === 'AUDITOR';
}

/**
 * GET /api/vehicles
 * Lista e veturave (ADMIN/AUDITOR krejt, COMMANDER vetëm unit-in e vet)
 */
r.get('/', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const filter: any = {};

    if (!canSeeAll(me.role)) {
        // komandanti (dhe të tjerët) vetëm vetat
        filter.unitId = me.unitId;
    }

    const items = await Vehicle.find(filter).populate('unitId', 'code name').sort({ name: 1 }).lean();
    res.json(
        items.map((v: any) => ({
            id: String(v._id),
            name: v.name,
            plateNumber: v.plateNumber,
            status: v.status,
            unit: v.unitId
                ? { id: String(v.unitId._id), code: v.unitId.code, name: v.unitId.name }
                : null,
            deviceId: v.deviceId ?? null,
            createdAt: v.createdAt,
        }))
    );
});

/**
 * POST /api/vehicles (vetëm ADMIN)
 */
r.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const { name, plateNumber, unitId, status, deviceId } = req.body ?? {};
    if (!name || !plateNumber || !unitId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name, plateNumber, unitId required' });
    }

    const exists = await Vehicle.findOne({ plateNumber: String(plateNumber).trim() }).lean();
    if (exists) return res.status(409).json({ code: 'PLATE_EXISTS' });

    const v: any = await Vehicle.create({
        name: String(name).trim(),
        plateNumber: String(plateNumber).trim(),
        unitId,
        status: status || 'ACTIVE',
        deviceId: deviceId || null,
    });

    res.status(201).json({ id: String(v._id) });
});

/**
 * PUT /api/vehicles/:id (vetëm ADMIN)
 */
r.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const { name, plateNumber, unitId, status, deviceId } = req.body ?? {};
    const update: any = {};

    if (name !== undefined) update.name = String(name).trim();
    if (plateNumber !== undefined) update.plateNumber = String(plateNumber).trim();
    if (unitId !== undefined) update.unitId = unitId;
    if (status !== undefined) update.status = status;
    if (deviceId !== undefined) update.deviceId = deviceId || null;

    // nëse po ndërron plateNumber, kontrollo unik
    if (update.plateNumber) {
        const exists = await Vehicle.findOne({
            plateNumber: update.plateNumber,
            _id: { $ne: req.params.id },
        }).lean();
        if (exists) return res.status(409).json({ code: 'PLATE_EXISTS' });
    }

    const v = await Vehicle.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!v) return res.status(404).json({ code: 'NOT_FOUND' });

    res.json({ ok: true });
});

/**
 * DELETE /api/vehicles/:id (vetëm ADMIN)
 */
r.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
    await VehicleLocation.deleteOne({ vehicleId: req.params.id });
    const v = await Vehicle.findByIdAndDelete(req.params.id);
    if (!v) return res.status(404).json({ code: 'NOT_FOUND' });
    res.json({ ok: true });
});

/**
 * GET /api/vehicles/live
 * LIVE locations (ADMIN/AUDITOR krejt, COMMANDER vetëm unit-in e vet)
 */
r.get('/live', requireAuth, async (req: any, res) => {
    const me = req.user as AuthUserPayload;
    const filter: any = {};

    if (!canSeeAll(me.role)) {
        filter.unitId = me.unitId;
    }

    const points = await VehicleLocation.find(filter)
        .populate('vehicleId', 'name plateNumber status unitId')
        .sort({ capturedAt: -1 })
        .lean();

    res.json(
        points.map((p: any) => ({
            id: String(p._id),
            vehicle: p.vehicleId
                ? {
                    id: String(p.vehicleId._id),
                    name: p.vehicleId.name,
                    plateNumber: p.vehicleId.plateNumber,
                    status: p.vehicleId.status,
                }
                : null,
            unitId: String(p.unitId),
            lat: p.lat,
            lng: p.lng,
            speed: p.speed ?? 0,
            heading: p.heading ?? 0,
            capturedAt: p.capturedAt,
        }))
    );
});

/**
 * POST /api/vehicles/:id/mock-location
 * ✅ për test pa pajisje GPS (vetëm ADMIN)
 */
r.post('/:id/mock-location', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const { lat, lng, speed, heading, capturedAt } = req.body ?? {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'lat & lng required (number)' });
    }

    const v: any = await Vehicle.findById(req.params.id).lean();
    if (!v) return res.status(404).json({ code: 'NOT_FOUND' });

    await VehicleLocation.findOneAndUpdate(
        { vehicleId: v._id },
        {
            vehicleId: v._id,
            unitId: v.unitId,
            lat,
            lng,
            speed: typeof speed === 'number' ? speed : 0,
            heading: typeof heading === 'number' ? heading : 0,
            capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        },
        { upsert: true, new: true }
    );

    res.json({ ok: true });
});

export default r;
