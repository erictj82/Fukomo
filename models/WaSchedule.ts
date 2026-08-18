import mongoose, { Document, Schema } from 'mongoose';

export type WaScheduleStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface IWaSchedule extends Document {
    customerId: mongoose.Types.ObjectId;
    transactionId: mongoose.Types.ObjectId;
    phoneNumber: string;
    templateId: mongoose.Types.ObjectId;
    serviceName?: string;
    scheduledAt: Date;
    status: WaScheduleStatus;
    sentAt?: Date;
    processedAt?: Date;
    error?: string;
}

const waScheduleSchema = new Schema<IWaSchedule>(
    {
        customerId: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        transactionId: {
            type: Schema.Types.ObjectId,
            ref: 'Invoice',
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
        },
        templateId: {
            type: Schema.Types.ObjectId,
            ref: 'WaTemplate',
            required: true,
        },
        serviceName: {
            type: String,
            trim: true,
        },
        scheduledAt: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'sent', 'failed'],
            default: 'pending',
            required: true,
        },
        sentAt: {
            type: Date,
        },
        processedAt: {
            type: Date,
        },
        error: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

waScheduleSchema.index({ status: 1, scheduledAt: 1 });
// Partial unique index: cegah duplikat pending untuk kombinasi yang sama,
// tapi izinkan sent/failed (retry scenario tidak terblokir).
waScheduleSchema.index(
    { transactionId: 1, templateId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['pending', 'processing'] } } }
);

export default mongoose.models.WaSchedule || mongoose.model<IWaSchedule>('WaSchedule', waScheduleSchema);