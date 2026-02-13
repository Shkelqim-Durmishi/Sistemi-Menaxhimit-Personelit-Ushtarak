// apps/api/src/models/Justification.ts

import { Schema, model, Types } from 'mongoose';

const JustificationSchema = new Schema(
  {
    reportId: {
      type: Types.ObjectId,
      ref: 'DailyReport',
      required: true,
      // index: true ❌ HIQET
    },

    personId: {
      type: Types.ObjectId,
      ref: 'Person',
      required: true,
      index: true,
    },

    categoryId: {
      type: Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },

    from: {
      type: Date,
      required: true,
    },

    to: {
      type: Date,
      required: true,
    },

    location: {
      type: String,
      trim: true,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: null,
    },

    emergency: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* =====================
   INDEXE SHTESË
   ===================== */

// kërkim i shpejtë për justifikime sipas personit + datës
JustificationSchema.index({ personId: 1, from: 1 });

// raport → rreshta
JustificationSchema.index({ reportId: 1 });

export default model('Justification', JustificationSchema);
