import mongoose from 'mongoose';

const SystemNoticeSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    severity: { type: String, enum: ['urgent', 'info', 'warning'], default: 'info' },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('SystemNotice', SystemNoticeSchema);