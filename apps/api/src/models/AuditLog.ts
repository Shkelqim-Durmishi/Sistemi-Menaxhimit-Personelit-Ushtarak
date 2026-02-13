import { Schema, model, Types } from 'mongoose';
const AuditLogSchema = new Schema({
  actorId: { type: Types.ObjectId, ref: 'User' },
  action: String,
  entity: String,
  entityId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  at: { type: Date, default: Date.now }
});
export default model('AuditLog', AuditLogSchema);
