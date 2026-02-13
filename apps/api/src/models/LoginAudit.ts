import { Schema, model, Types } from 'mongoose';

const LoginAuditSchema = new Schema(
    {
        // Mund të jetë null në rast tentimesh të dështuara kur s'gjejmë user-in
        userId: { type: Types.ObjectId, ref: 'User', default: null },

        username: { type: String, required: true },

        role: {
            type: String,
            enum: ['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR'],
            required: true,
        },

        // Njësia e përdoruesit (nëse ka)
        unitId: { type: Types.ObjectId, ref: 'Unit', default: null },

        // Tipi i eventit
        // LOGIN  – sukses
        // LOGOUT – dalje
        // INVALID_PASSWORD – fjalëkalim i gabuar
        // AUTO_BLOCK – bllokim automatik pas shumë tentimesh
        type: {
            type: String,
            enum: ['LOGIN', 'LOGOUT', 'INVALID_PASSWORD', 'AUTO_BLOCK'],
            required: true,
        },

        // Info shtesë
        ip: { type: String, default: '' },
        userAgent: { type: String, default: '' },
    },
    { timestamps: true }
);

/* Index-e për filtrim të shpejtë në /login-audit */
LoginAuditSchema.index({ createdAt: -1 });
LoginAuditSchema.index({ username: 1, createdAt: -1 });
LoginAuditSchema.index({ type: 1, createdAt: -1 });

export default model('LoginAudit', LoginAuditSchema);