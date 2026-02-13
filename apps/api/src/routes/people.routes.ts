// apps/api/src/routes/people.routes.ts

import { Router } from 'express';
import mongoose from 'mongoose';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import Person from '../models/Person';
import Justification from '../models/Justification';
import Category from '../models/Category';

import { requireAuth, requireRole } from '../middleware/auth';

const r = Router();

/* ===== helper ===== */
function sameUnit(user: any, unitId: any) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!user.unitId) return false;
  return String(user.unitId) === String(unitId);
}

/**
 * ✅ Kush ka të drejtë me pa arsyen e refuzimit?
 * - ADMIN / COMMANDER: po
 * - OPERATOR: vetëm nëse ai e ka kriju ushtarin (createdBy === user.id)
 */
function canSeeRejectionReason(user: any, person: any) {
  if (!user || !person) return false;
  if (user.role === 'ADMIN' || user.role === 'COMMANDER') return true;
  if (user.role === 'OPERATOR') return String(person.createdBy) === String(user.id);
  return false;
}

/**
 * ✅ Fshih fushat sensitive (rejectionReason etj) kur s’ka leje
 */
function sanitizePersonForUser(user: any, person: any) {
  if (!person) return person;

  if (!canSeeRejectionReason(user, person)) {
    const p: any = { ...person };
    delete p.rejectionReason;
    delete p.rejectedAt;
    delete p.rejectedBy;
    return p;
  }

  return person;
}

/**
 * Ruaj foto base64 (dataURL) në disk dhe kthe URL lokale (/uploads/people/...)
 * Pranon vetëm image/png dhe image/jpeg
 */
async function savePersonPhotoFromDataUrl(dataUrl: string, serviceNo: string) {
  const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return null;

  const mime = String(m[1]).toLowerCase();
  const base64 = String(m[2]).replace(/\s/g, '');
  const ext = mime === 'image/png' ? 'png' : 'jpg';

  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    const err: any = new Error('PHOTO_INVALID_BASE64');
    err.code = 'PHOTO_INVALID_BASE64';
    throw err;
  }

  // max 2MB
  const maxBytes = 2 * 1024 * 1024;
  if (buf.length > maxBytes) {
    const err: any = new Error('PHOTO_TOO_LARGE');
    err.code = 'PHOTO_TOO_LARGE';
    throw err;
  }

  if (!buf || buf.length < 20) {
    const err: any = new Error('PHOTO_INVALID');
    err.code = 'PHOTO_INVALID';
    throw err;
  }

  const uploadsDir = path.join(process.cwd(), 'uploads', 'people');
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeServiceNo = String(serviceNo || 'person').replace(/[^a-zA-Z0-9_-]/g, '');
  const name = `person-${safeServiceNo}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const filePath = path.join(uploadsDir, name);

  await fs.writeFile(filePath, buf);

  // URL që do ta shërbejë express static: /uploads/people/<file>
  return `/uploads/people/${name}`;
}

/* ==================================================
   LIST PEOPLE
   ================================================== */
r.get(
  '/',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;

    const q = ((req.query.q as string) || '').trim();
    const status = ((req.query.status as string) || '').trim();
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);

    const filter: any = {};

    if (q) {
      filter.$or = [
        { serviceNo: new RegExp(q, 'i') },
        { firstName: new RegExp(q, 'i') },
        { lastName: new RegExp(q, 'i') },
        { personalNumber: new RegExp(q, 'i') },
      ];
    }

    if (status) filter.status = status;

    if (user.role !== 'ADMIN') {
      if (!user.unitId) return res.status(403).json({ code: 'NO_UNIT_ASSIGNED' });
      filter.unitId = user.unitId;
    }

    const [rawItems, total] = await Promise.all([
      Person.find(filter).sort({ serviceNo: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Person.countDocuments(filter),
    ]);

    const items = rawItems.map((p: any) => sanitizePersonForUser(user, p));
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  }
);

/* ==================================================
   GET PERSON BY ID
   ================================================== */
r.get(
  '/:id',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    const person: any = await Person.findById(id).lean();
    if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (!sameUnit(user, person.unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    return res.json(sanitizePersonForUser(user, person));
  }
);

/* ==================================================
   CREATE PERSON
   ================================================== */
r.post(
  '/',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN'),
  async (req, res) => {
    const user: any = (req as any).user;

    const {
      serviceNo,
      firstName,
      lastName,
      personalNumber,
      birthDate,
      gender,
      city,
      address,
      phone,
      notes,
      gradeId,
      unitId,
      position,
      serviceStartDate,
      photoUrl,
    } = req.body ?? {};

    const missing: string[] = [];
    if (!serviceNo) missing.push('serviceNo');
    if (!firstName) missing.push('firstName');
    if (!lastName) missing.push('lastName');
    if (!gradeId) missing.push('gradeId');
    if (!unitId) missing.push('unitId');
    if (!personalNumber) missing.push('personalNumber');
    if (!birthDate) missing.push('birthDate');
    if (!gender) missing.push('gender');
    if (!city) missing.push('city');
    if (!address) missing.push('address');
    if (!phone) missing.push('phone');
    if (!position) missing.push('position');
    if (!serviceStartDate) missing.push('serviceStartDate');

    if (missing.length) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Fushat e detyrueshme mungojnë: ${missing.join(', ')}`,
      });
    }

    if (user.role !== 'ADMIN') {
      if (!user.unitId) return res.status(403).json({ code: 'NO_UNIT_ASSIGNED' });
      if (String(user.unitId) !== String(unitId)) {
        return res.status(403).json({ code: 'FORBIDDEN_UNIT_CREATE' });
      }
    }

    try {
      const sNo = String(serviceNo).trim();
      const pn = String(personalNumber).trim();

      const exists = await Person.findOne({ serviceNo: sNo }).lean();
      if (exists) return res.status(409).json({ code: 'SERVICE_NO_EXISTS' });

      const existsPn = await Person.findOne({ personalNumber: pn }).lean();
      if (existsPn) return res.status(409).json({ code: 'PERSONAL_NUMBER_EXISTS' });

      let storedPhotoUrl: string | null = null;
      if (photoUrl && typeof photoUrl === 'string' && photoUrl.startsWith('data:image/')) {
        storedPhotoUrl = await savePersonPhotoFromDataUrl(photoUrl, sNo);
      } else if (photoUrl && typeof photoUrl === 'string') {
        storedPhotoUrl = String(photoUrl).trim();
      }

      const person = await Person.create({
        serviceNo: sNo,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        personalNumber: pn,

        birthDate: new Date(birthDate),
        gender,
        city: String(city).trim(),
        address: String(address).trim(),
        phone: String(phone).trim(),

        notes: notes ? String(notes) : null,

        gradeId: String(gradeId).trim(),
        unitId,

        position: String(position).trim(),
        serviceStartDate: new Date(serviceStartDate),

        photoUrl: storedPhotoUrl || null,

        status: 'PENDING',
        createdBy: user.id,
      });

      return res.status(201).json(person);
    } catch (err: any) {
      console.error('CREATE PERSON ERROR', err);

      if (err?.code === 'PHOTO_TOO_LARGE') {
        return res.status(400).json({ code: 'PHOTO_TOO_LARGE', message: 'Foto max 2MB.' });
      }

      if (err?.code === 'PHOTO_INVALID_BASE64' || err?.code === 'PHOTO_INVALID') {
        return res.status(400).json({ code: 'PHOTO_INVALID', message: 'Foto nuk është valide.' });
      }

      if (err?.name === 'ValidationError') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
      }

      if (err?.code === 11000) {
        if (err?.keyPattern?.serviceNo) return res.status(409).json({ code: 'SERVICE_NO_EXISTS' });
        if (err?.keyPattern?.personalNumber) return res.status(409).json({ code: 'PERSONAL_NUMBER_EXISTS' });
      }

      return res.status(500).json({ code: 'INTERNAL_ERROR' });
    }
  }
);

/* ==================================================
   ✅ UPDATE PERSON (PUT /:id)  <-- KJO MUNGONTE
   - OPERATOR: vetëm krijuesi (createdBy) dhe vetëm brenda njësisë së vet
   - ADMIN: lejohet
   ================================================== */
r.put(
  '/:id',
  requireAuth,
  requireRole('OPERATOR', 'ADMIN'),
  async (req, res) => {
    const user: any = (req as any).user;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    const person: any = await Person.findById(id);
    if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (!sameUnit(user, person.unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    // ✅ vetëm krijuesi (operatori) ose admini
    if (user.role !== 'ADMIN' && String(person.createdBy) !== String(user.id)) {
      return res.status(403).json({ code: 'FORBIDDEN_UPDATE' });
    }

    const {
      serviceNo,
      firstName,
      lastName,
      gradeId,
      unitId,
      personalNumber,
      birthDate,
      gender,
      city,
      address,
      phone,
      position,
      serviceStartDate,
      notes,
      photoUrl,
    } = req.body ?? {};

    // (opsionale) validim minimal – sepse ti po e dërgon krejt formën nga frontend
    const missing: string[] = [];
    if (!serviceNo) missing.push('serviceNo');
    if (!firstName) missing.push('firstName');
    if (!lastName) missing.push('lastName');
    if (!gradeId) missing.push('gradeId');
    if (!unitId) missing.push('unitId');
    if (!personalNumber) missing.push('personalNumber');
    if (!birthDate) missing.push('birthDate');
    if (!gender) missing.push('gender');
    if (!city) missing.push('city');
    if (!address) missing.push('address');
    if (!phone) missing.push('phone');
    if (!position) missing.push('position');
    if (!serviceStartDate) missing.push('serviceStartDate');

    if (missing.length) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Fushat e detyrueshme mungojnë: ${missing.join(', ')}`,
      });
    }

    // jo-admin: mos lejo me ndërru unitId në njësi tjetër
    if (user.role !== 'ADMIN') {
      if (!user.unitId) return res.status(403).json({ code: 'NO_UNIT_ASSIGNED' });
      if (String(user.unitId) !== String(unitId)) {
        return res.status(403).json({ code: 'FORBIDDEN_UNIT_UPDATE' });
      }
    }

    try {
      const sNo = String(serviceNo).trim();
      const pn = String(personalNumber).trim();

      // unik: serviceNo
      const existsService = await Person.findOne({ serviceNo: sNo, _id: { $ne: person._id } }).lean();
      if (existsService) return res.status(409).json({ code: 'SERVICE_NO_EXISTS' });

      // unik: personalNumber
      const existsPn = await Person.findOne({ personalNumber: pn, _id: { $ne: person._id } }).lean();
      if (existsPn) return res.status(409).json({ code: 'PERSONAL_NUMBER_EXISTS' });

      person.serviceNo = sNo;
      person.firstName = String(firstName).trim();
      person.lastName = String(lastName).trim();
      person.gradeId = String(gradeId).trim();
      person.unitId = unitId;

      person.personalNumber = pn;
      person.birthDate = new Date(birthDate);
      person.gender = gender;
      person.city = String(city).trim();
      person.address = String(address).trim();
      person.phone = String(phone).trim();
      person.position = String(position).trim();
      person.serviceStartDate = new Date(serviceStartDate);

      person.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

      // 📸 foto
      if (typeof photoUrl === 'string' && photoUrl.startsWith('data:image/')) {
        const storedPhotoUrl = await savePersonPhotoFromDataUrl(photoUrl, sNo);
        person.photoUrl = storedPhotoUrl || null;
      } else if (typeof photoUrl === 'string') {
        person.photoUrl = photoUrl.trim() ? photoUrl.trim() : null;
      } else if (photoUrl === null) {
        person.photoUrl = null;
      }

      await person.save();

      const out = person.toObject ? person.toObject() : person;
      return res.json(sanitizePersonForUser(user, out));
    } catch (err: any) {
      console.error('UPDATE PERSON ERROR', err);

      if (err?.code === 'PHOTO_TOO_LARGE') {
        return res.status(400).json({ code: 'PHOTO_TOO_LARGE', message: 'Foto max 2MB.' });
      }

      if (err?.code === 'PHOTO_INVALID_BASE64' || err?.code === 'PHOTO_INVALID') {
        return res.status(400).json({ code: 'PHOTO_INVALID', message: 'Foto nuk është valide.' });
      }

      return res.status(500).json({ code: 'INTERNAL_ERROR' });
    }
  }
);

/* ==================================================
   APPROVE PERSON (COMMANDER / ADMIN)
   ================================================== */
r.post(
  '/:id/approve',
  requireAuth,
  requireRole('COMMANDER', 'ADMIN'),
  async (req, res) => {
    const user: any = (req as any).user;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    const person: any = await Person.findById(id);
    if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (!sameUnit(user, person.unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    if (person.status === 'ACTIVE') {
      return res.status(400).json({ code: 'ALREADY_ACTIVE' });
    }

    person.status = 'ACTIVE';
    person.approvedBy = user.id;
    person.approvedAt = new Date();

    person.rejectedBy = undefined;
    person.rejectedAt = undefined;
    person.rejectionReason = undefined;

    await person.save();
    res.json(person);
  }
);

/* ==================================================
   REJECT PERSON (COMMANDER / ADMIN)
   ================================================== */
r.post(
  '/:id/reject',
  requireAuth,
  requireRole('COMMANDER', 'ADMIN'),
  async (req, res) => {
    const user: any = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body ?? {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Arsyeja e refuzimit (reason) është e detyrueshme.',
      });
    }

    const person: any = await Person.findById(id);
    if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (!sameUnit(user, person.unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    person.status = 'REJECTED';
    person.rejectedBy = user.id;
    person.rejectedAt = new Date();
    person.rejectionReason = String(reason).trim();

    await person.save();

    res.json(sanitizePersonForUser(user, person.toObject ? person.toObject() : person));
  }
);

/* ==================================================
   RESUBMIT (OPERATOR/ADMIN)
   - PATCH /:id/resubmit  (origjinali)
   - POST  /:id/resubmit  (alias për frontend-in tënd)
   ================================================== */
async function resubmitHandler(req: any, res: any) {
  const user: any = (req as any).user;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ code: 'INVALID_ID' });
  }

  const person: any = await Person.findById(id);
  if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

  if (!sameUnit(user, person.unitId)) {
    return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
  }

  if (user.role !== 'ADMIN' && String(person.createdBy) !== String(user.id)) {
    return res.status(403).json({ code: 'FORBIDDEN_RESUBMIT' });
  }

  if (person.status !== 'REJECTED') {
    return res.status(400).json({ code: 'NOT_REJECTED' });
  }

  const {
    firstName,
    lastName,
    personalNumber,
    birthDate,
    gender,
    city,
    address,
    phone,
    notes,
    gradeId,
    position,
    serviceStartDate,
    photoUrl,
  } = req.body ?? {};

  try {
    if (typeof personalNumber === 'string' && personalNumber.trim()) {
      const pn = personalNumber.trim();
      const existsPn = await Person.findOne({ personalNumber: pn, _id: { $ne: person._id } }).lean();
      if (existsPn) return res.status(409).json({ code: 'PERSONAL_NUMBER_EXISTS' });
      person.personalNumber = pn;
    }

    if (typeof firstName === 'string') person.firstName = firstName.trim();
    if (typeof lastName === 'string') person.lastName = lastName.trim();
    if (typeof gradeId === 'string') person.gradeId = gradeId.trim();
    if (typeof gender === 'string') person.gender = gender;

    if (typeof city === 'string') person.city = city.trim();
    if (typeof address === 'string') person.address = address.trim();
    if (typeof phone === 'string') person.phone = phone.trim();
    if (typeof position === 'string') person.position = position.trim();

    if (typeof notes === 'string') person.notes = notes.trim() ? notes.trim() : null;
    if (birthDate) person.birthDate = new Date(birthDate);
    if (serviceStartDate) person.serviceStartDate = new Date(serviceStartDate);

    if (typeof photoUrl === 'string' && photoUrl.startsWith('data:image/')) {
      const storedPhotoUrl = await savePersonPhotoFromDataUrl(photoUrl, String(person.serviceNo));
      person.photoUrl = storedPhotoUrl || null;
    } else if (typeof photoUrl === 'string') {
      person.photoUrl = photoUrl.trim() ? photoUrl.trim() : null;
    }

    person.status = 'PENDING';

    person.rejectedBy = undefined;
    person.rejectedAt = undefined;
    person.rejectionReason = undefined;

    await person.save();

    const out = person.toObject ? person.toObject() : person;
    return res.json(sanitizePersonForUser(user, out));
  } catch (err: any) {
    console.error('RESUBMIT PERSON ERROR', err);

    if (err?.code === 'PHOTO_TOO_LARGE') {
      return res.status(400).json({ code: 'PHOTO_TOO_LARGE', message: 'Foto max 2MB.' });
    }

    if (err?.code === 'PHOTO_INVALID_BASE64' || err?.code === 'PHOTO_INVALID') {
      return res.status(400).json({ code: 'PHOTO_INVALID', message: 'Foto nuk është valide.' });
    }

    return res.status(500).json({ code: 'INTERNAL_ERROR' });
  }
}

r.patch(
  '/:id/resubmit',
  requireAuth,
  requireRole('OPERATOR', 'ADMIN'),
  resubmitHandler
);

// ✅ alias për frontend-in tënd (që po përdor POST)
r.post(
  '/:id/resubmit',
  requireAuth,
  requireRole('OPERATOR', 'ADMIN'),
  resubmitHandler
);

/* ==================================================
   UPCOMING APPROVED LEAVE
   ================================================== */
r.get(
  '/:id/upcoming-leave',
  requireAuth,
  requireRole('OPERATOR', 'OFFICER', 'COMMANDER', 'ADMIN', 'AUDITOR'),
  async (req, res) => {
    const user: any = (req as any).user;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    const person = await Person.findById(id).lean();
    if (!person) return res.status(404).json({ code: 'PERSON_NOT_FOUND' });

    if (!sameUnit(user, (person as any).unitId)) {
      return res.status(403).json({ code: 'FORBIDDEN_UNIT' });
    }

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const leaveCats = await Category.find({ code: { $in: ['01-12', '01-13'] } })
      .select('_id code label')
      .lean();

    const leaveCatIds = leaveCats.map((c) => c._id);

    const rows = await Justification.find({
      personId: id,
      categoryId: { $in: leaveCatIds },
      from: { $gte: tomorrow },
    })
      .populate('categoryId', 'code label')
      .populate('reportId', 'status date unitId')
      .sort({ from: 1 })
      .lean();

    const approved = rows.find((r) => (r as any)?.reportId?.status === 'APPROVED');
    if (!approved) return res.json(null);

    res.json({
      from: approved.from,
      to: approved.to,
      category: (approved as any).categoryId,
      report: (approved as any).reportId,
    });
  }
);

export default r;