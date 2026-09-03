import mongoose, { Schema, Document } from 'mongoose';

export interface IIntegrationIdempotency extends Document {
    key: string;
    statusCode: number;
    body: Record<string, unknown>;
    expiresAt: Date;
}

const schema = new Schema<IIntegrationIdempotency>(
    {
        key: { type: String, required: true, unique: true },
        statusCode: { type: Number, required: true },
        body: { type: Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.IntegrationIdempotency
    || mongoose.model<IIntegrationIdempotency>('IntegrationIdempotency', schema);
