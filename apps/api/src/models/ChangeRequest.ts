// apps/api/src/models/ChangeRequest.ts

import { Schema, model, Types } from 'mongoose';

export type Role = 'ADMIN' | 'OFFICER' | 'OPERATOR' | 'COMMANDER' | 'AUDITOR';

export type ChangeRequestType =
    | 'DELETE_PERSON'
    | 'TRANSFER_PERSON'
    | 'CHANGE_GRADE'
    | 'CHANGE_UNIT'
    | 'DEACTIVATE_PERSON'
    | 'UPDATE_PERSON'
    | 'CREATE_USER'; // ✅ NEW (admin-only flow)

export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

const ChangeRequestSchema = new Schema(
    {
        type: {
            type: String,
            enum: [
                'DELETE_PERSON',
                'TRANSFER_PERSON',
                'CHANGE_GRADE',
                'CHANGE_UNIT',
                'DEACTIVATE_PERSON',
                'UPDATE_PERSON',
                'CREATE_USER', // ✅ NEW
            ],
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
            default: 'PENDING',
            index: true,
        },

        // kush e krijoi
        createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

        createdByRole: {
            type: String,
            enum: ['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR'],
            required: true,
        },

        createdByUnitId: { type: Types.ObjectId, ref: 'Unit', default: null, index: true },

        /**
         * ✅ personId
         * - për request-at e personit është required
         * - për CREATE_USER është NULL
         */
        personId: {
            type: Types.ObjectId,
            ref: 'Person',
            default: null,
            index: true,
            required: function (this: any) {
                return this.type !== 'CREATE_USER';
            },
        },

        /**
         * ✅ Routing
         * - targetUnitId: për request-at e personit (inbox komandantit)
         * - targetRole: kur është 'ADMIN' -> admin-only inbox
         */
        targetUnitId: { type: Types.ObjectId, ref: 'Unit', required: true, index: true },

        targetRole: {
            type: String,
            enum: ['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR'],
            default: null,
            index: true,
        },

        // payload (opsionale sipas tipit)
        payload: {
            // transfer / change unit
            toUnitId: { type: Types.ObjectId, ref: 'Unit', default: null },

            // change grade
            newGradeId: { type: String, default: null },

            // arsye / shenime (operator/commander)
            reason: { type: String, default: '' },

            /**
             * ✅ UPDATE_PERSON
             * payload.meta.patch = { firstName, lastName, phone, city, ... }
             */
            meta: { type: Schema.Types.Mixed, default: {} },

            /**
             * ✅ CREATE_USER
             * payload.user = { username, email, role, unitId, contractValidFrom, contractValidTo, neverExpires, mustChangePassword }
             */
            user: { type: Schema.Types.Mixed, default: null },
        },

        // vendimi
        decidedBy: { type: Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
        decisionNote: { type: String, default: '' },

        // PDF
        docNo: { type: String, default: '' },

        pdf: {
            path: { type: String, default: '' },
            generatedAt: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

// inbox komandant: status + targetUnitId + më të rejat
ChangeRequestSchema.index({ status: 1, targetUnitId: 1, createdAt: -1 });

// inbox admin-only: status + targetRole + më të rejat
ChangeRequestSchema.index({ status: 1, targetRole: 1, createdAt: -1 });

export default model('ChangeRequest', ChangeRequestSchema);