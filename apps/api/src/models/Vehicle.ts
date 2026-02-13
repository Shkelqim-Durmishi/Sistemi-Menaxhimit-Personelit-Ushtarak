import { Schema, model, Types } from 'mongoose';

const VehicleSchema = new Schema(
    {
        name: { type: String, required: true, trim: true }, // p.sh. "Hilux-01"
        plateNumber: { type: String, required: true, unique: true, trim: true }, // "01-123-AB"
        unitId: { type: Types.ObjectId, ref: 'Unit', required: true, index: true },

        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'],
            default: 'ACTIVE',
            index: true,
        },

        // për të ardhmen kur të keni pajisje GPS reale
        deviceId: { type: String, default: null, index: true },
    },
    { timestamps: true }
);

VehicleSchema.index({ unitId: 1, status: 1 });

export default model('Vehicle', VehicleSchema);
