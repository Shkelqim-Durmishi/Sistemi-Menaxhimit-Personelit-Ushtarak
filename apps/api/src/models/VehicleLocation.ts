import { Schema, model, Types } from 'mongoose';

const VehicleLocationSchema = new Schema(
    {
        vehicleId: { type: Types.ObjectId, ref: 'Vehicle', required: true, unique: true },
        unitId: { type: Types.ObjectId, ref: 'Unit', required: true, index: true },

        lat: { type: Number, required: true },
        lng: { type: Number, required: true },

        speed: { type: Number, default: 0 },
        heading: { type: Number, default: 0 },

        capturedAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true }
);

VehicleLocationSchema.index({ unitId: 1, capturedAt: -1 });

export default model('VehicleLocation', VehicleLocationSchema);
