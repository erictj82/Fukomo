import mongoose, { Schema, Model, models } from 'mongoose';

export type CorrectionAction = 'add' | 'replace' | 'remove';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface ICorrectionRequest {
    _id: string;
    appointment: mongoose.Types.ObjectId;
    workOrderId?: string;
    workOrderNumber?: string;
    customer?: mongoose.Types.ObjectId;
    customerName?: string;
    action: CorrectionAction;
    fukomoLineId?: string;
    jobId?: string;
    fromServiceId?: string;
    fromServiceName?: string;
    toServiceId?: string;
    toServiceName?: string;
    reason: string;
    rejectReason?: string;
    status: CorrectionStatus;
    requestedBy?: mongoose.Types.ObjectId;
    requestedByName?: string;
    requestedAt: Date;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedByName?: string;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const CorrectionRequestSchema = new Schema<ICorrectionRequest>(
    {
        appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
        workOrderId: { type: String, index: true },
        workOrderNumber: { type: String },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
        customerName: { type: String },
        action: { type: String, enum: ['add', 'replace', 'remove'], required: true },
        fukomoLineId: { type: String },
        jobId: { type: String },
        fromServiceId: { type: String },
        fromServiceName: { type: String },
        toServiceId: { type: String },
        toServiceName: { type: String },
        reason: { type: String, required: true, trim: true },
        rejectReason: { type: String, trim: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        requestedByName: { type: String },
        requestedAt: { type: Date, default: Date.now },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewedByName: { type: String },
        reviewedAt: { type: Date },
    },
    { timestamps: true }
);

const CorrectionRequest =
    (models.CorrectionRequest as Model<ICorrectionRequest>) ||
    mongoose.model<ICorrectionRequest>('CorrectionRequest', CorrectionRequestSchema);

export default CorrectionRequest;
