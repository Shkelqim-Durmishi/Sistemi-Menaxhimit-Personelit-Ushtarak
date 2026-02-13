// apps/api/src/models/ChangeRequest.ts

import { Schema, model, Types } from 'mongoose';

export type ChangeRequestType =
    | 'DELETE_PERSON'
    | 'TRANSFER_PERSON'
    | 'CHANGE_GRADE'
    | 'CHANGE_UNIT'
    | 'DEACTIVATE_PERSON'
    | 'UPDATE_PERSON'; // ✅ NEW

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
                'UPDATE_PERSON', // ✅ NEW
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

        // per cilin ushtar/person
        personId: { type: Types.ObjectId, ref: 'Person', required: true, index: true },

        // unit target: për filtrimin e COMMANDER-it (unit i personit “aktual” para ndryshimit)
        targetUnitId: { type: Types.ObjectId, ref: 'Unit', required: true, index: true },

        // payload (opsionale sipas tipit)
        payload: {
            // transfer / change unit
            toUnitId: { type: Types.ObjectId, ref: 'Unit', default: null },

            // change grade
            newGradeId: { type: String, default: null },

            // arsye / shenime
            reason: { type: String, default: '' },

            /**
             * ✅ UPDATE_PERSON
             * payload.meta.patch = { firstName, lastName, phone, city, ... }
             */
            meta: { type: Schema.Types.Mixed, default: {} },
        },

        // vendimi i komandantit
        decidedBy: { type: Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
        decisionNote: { type: String, default: '' },

        /**
         * ✅ PDF (opsionale)
         * Kur komandanti aprovon/refuzon, mundesh me gjeneru PDF dhe:
         * - pdf.path = "/uploads/requests/req-....pdf"
         * - pdf.generatedAt = data e gjenerimit
         * - docNo = numri protokollit (nëse don me pas si në template)
         */
        docNo: { type: String, default: '' },
        pdf: {
            path: { type: String, default: '' }, // p.sh. "/uploads/requests/req-xxx.pdf"
            generatedAt: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

// query tipike: status + unit (për komandant) + më të rejat
ChangeRequestSchema.index({ status: 1, targetUnitId: 1, createdAt: -1 });

export default model('ChangeRequest', ChangeRequestSchema);
