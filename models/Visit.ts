import mongoose, { Schema, Document } from 'mongoose';

export type VisitStatus = 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled';

export interface IVisitLine {
    lineId: string;
    service: mongoose.Types.ObjectId;
    name: string;
    price: number;
    duration: number;
    packageFlag: boolean;
}

export interface IVisit extends Document {
    appointment: mongoose.Types.ObjectId;
    customer: mongoose.Types.ObjectId;
    status: VisitStatus;
    lineItems: IVisitLine[];
    workOrderId?: string;
    workOrderNumber?: string;
    lastSyncAt?: Date;
    lastEvent?: string;
    performers?: {
        lineId: string;
        staffName?: string;
        fukomoStaffId?: string;
        workStaffId?: string;
        credit?: number;
        completedAt?: Date;
    }[];
    notes?: string;
}

const visitSchema = new Schema<IVisit>(
    {
        appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        status: {
            type: String,
            enum: ['draft', 'dispatched', 'in_progress', 'completed', 'cancelled'],
            default: 'draft',
        },
        lineItems: [
            {
                lineId: { type: String, required: true },
                service: { type: Schema.Types.ObjectId, ref: 'Service' },
                name: String,
                price: { type: Number, default: 0 },
                duration: { type: Number, default: 0 },
                packageFlag: { type: Boolean, default: false },
            },
        ],
        workOrderId: { type: String },
        workOrderNumber: { type: String },
        lastSyncAt: { type: Date },
        lastEvent: { type: String },
        performers: [
            {
                lineId: String,
                staffName: String,
                fukomoStaffId: String,
                workStaffId: String,
                credit: Number,
                completedAt: Date,
            },
        ],
        notes: { type: String },
    },
    { timestamps: true }
);

visitSchema.index({ appointment: 1 }, { unique: true });
visitSchema.index({ workOrderId: 1 }, { sparse: true });

export default mongoose.models.Visit || mongoose.model<IVisit>('Visit', visitSchema);
