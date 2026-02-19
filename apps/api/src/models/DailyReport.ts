import mongoose, { Schema, model, Types } from 'mongoose';

const DailyReportSchema = new Schema({
  date: { type: Date, required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  // e bëjmë opsional (default: null) që të lejojë krijim pa auth gjatë dev
  createdBy: { type: Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], default: 'DRAFT' }
}, { timestamps: true });

DailyReportSchema.index({ date: 1, unitId: 1 }, { unique: true });

export default model('DailyReport', DailyReportSchema);
