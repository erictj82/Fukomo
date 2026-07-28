import mongoose, { Document, Schema } from 'mongoose';

export interface IWaTemplate extends Document {
    name: string;
    message: string;
    templateType: 'greeting' | 'follow_up';
    isGreetingEnabled: boolean;
    metaStatus?: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED';
    metaTemplateName?: string;
    metaCategory?: string;
    metaLanguage?: string;
    createdAt: Date;
}

const waTemplateSchema = new Schema<IWaTemplate>(
    {
        name: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        templateType: {
            type: String,
            enum: ['greeting', 'follow_up'],
            default: 'follow_up',
            required: true,
        },
        isGreetingEnabled: { type: Boolean, default: false },
        metaStatus: {
            type: String,
            enum: ['LOCAL', 'PENDING', 'APPROVED', 'REJECTED'],
            default: 'LOCAL',
        },
        metaTemplateName: { type: String, trim: true },
        metaCategory: { type: String, default: 'UTILITY' },
        metaLanguage: { type: String, default: 'id' },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

waTemplateSchema.index({ name: 1 });

export default mongoose.models.WaTemplate || mongoose.model<IWaTemplate>('WaTemplate', waTemplateSchema);
