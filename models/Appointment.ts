
import mongoose, { Schema, Document } from 'mongoose';

export interface IAppointment extends Document {
    customer: mongoose.Types.ObjectId;
    staff: mongoose.Types.ObjectId;
    services: {
        service: mongoose.Types.ObjectId;
        name: string;
        description?: string;
        price: number;
        duration: number;
        fukomoLineId?: string;
    }[];
    date: Date;
    startTime: string; // "14:00"
    endTime: string; // "15:00"
    totalDuration: number;
    subtotal: number;
    tax: number;
    totalAmount: number;
    discount: number;
    commission: number;
    tips: number;
    status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'no-show';
    notes?: string;
    cancelReason?: string;
    reminderSent?: boolean;
    reminderSentAt?: Date;
    statusHistory?: {
        status: string;
        fromStatus?: string;
        at: Date;
        by?: string;
        note?: string;
    }[];
    workOrderId?: string;
    workOrderNumber?: string;
    workSyncStatus?: string;
    workLastEventAt?: Date;
}

const appointmentSchema = new Schema<IAppointment>(
    {
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: false },
        services: [
            {
                service: { type: Schema.Types.ObjectId, ref: 'Service' },
                name: String,
                description: { type: String, trim: true },
                price: Number,
                duration: Number,
                fukomoLineId: String,
            },
        ],
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        totalDuration: { type: Number, required: true },
        subtotal: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        totalAmount: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        commission: { type: Number, default: 0 },
        tips: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'no-show'],
            default: 'pending',
        },
        notes: { type: String },
        cancelReason: { type: String },
        reminderSent: { type: Boolean, default: false },
        reminderSentAt: { type: Date },
        statusHistory: [
            {
                status: String,
                fromStatus: String,
                at: { type: Date, default: Date.now },
                by: String,
                note: String,
            },
        ],
        workOrderId: { type: String },
        workOrderNumber: { type: String },
        workSyncStatus: { type: String },
        workLastEventAt: { type: Date },
    },
    { timestamps: true }
);

// Optimize query performance
appointmentSchema.index({ date: 1, status: 1 });
appointmentSchema.index({ customer: 1 });
appointmentSchema.index({ staff: 1 });

export default mongoose.models.Appointment || mongoose.model<IAppointment>('Appointment', appointmentSchema);
