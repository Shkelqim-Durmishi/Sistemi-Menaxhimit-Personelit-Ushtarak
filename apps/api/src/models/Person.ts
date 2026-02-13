// src/models/Person.ts

import { Schema, model, Types } from 'mongoose';

const PersonSchema = new Schema(
  {
    // Nr. shërbimit – unik
    serviceNo: { type: String, required: true, trim: true },

    // Emri / mbiemri
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    // Nr. personal (opsional, unik)
    personalNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: null,
    },

    // Të dhëna personale
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ['M', 'F', 'O'], default: null },
    city: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    notes: { type: String, default: null },

    // ✅ Grada – STRING
    gradeId: { type: String, required: true, trim: true },

    // Njësia – referencë reale te Unit
    unitId: { type: Types.ObjectId, ref: 'Unit', required: true },

    // Pozita / detyra + data e fillimit
    position: { type: String, default: null, trim: true },
    serviceStartDate: { type: Date, default: null },

    // Foto (URL)
    photoUrl: { type: String, default: null },

    // Statusi
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },

    // Audit
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

// indekse të dobishme
PersonSchema.index({ serviceNo: 1 }, { unique: true });
PersonSchema.index({ unitId: 1, status: 1 });

export default model('Person', PersonSchema);
