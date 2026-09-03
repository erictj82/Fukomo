
import mongoose, { Schema, Document } from 'mongoose';

export interface IService extends Document {
    name: string;
    category: mongoose.Types.ObjectId;
    description?: string;
    duration: number; // in minutes
    price: number;
    memberPrice?: number;
    gender: 'male' | 'female' | 'unisex';
    image?: string;
    icon?: string;
    commissionType: 'percentage' | 'fixed';
    commissionValue: number;
    sellingCommissionType?: 'percentage' | 'fixed';
    sellingCommissionValue?: number;
    waFollowUp?: {
        enabled: boolean;
        firstDays: number;
        secondDays: number;
        firstDelayValue?: number;
        firstDelayUnit?: 'minute' | 'hour' | 'day';
        secondDelayValue?: number;
        secondDelayUnit?: 'minute' | 'hour' | 'day';
        firstTemplateId?: mongoose.Types.ObjectId;
        secondTemplateId?: mongoose.Types.ObjectId;
    };
    status: 'active' | 'inactive';
    materialsUsed?: {
        product: mongoose.Types.ObjectId;
        productName: string;
        quantityPerService: number;
    }[];
    parentService?: mongoose.Types.ObjectId;
    isFavorite?: boolean;
    skillName?: string;
    workServiceId?: string;
}

const serviceSchema = new Schema<IService>(
    {
        name: { type: String, required: true, trim: true },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceCategory',
            required: true,
        },
        description: { type: String, trim: true },
        duration: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        memberPrice: { type: Number, min: 0 },
        gender: {
            type: String,
            enum: ['male', 'female', 'unisex'],
            default: 'unisex',
        },
        image: { type: String },
        icon: { type: String },
        commissionType: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'fixed',
        },
        commissionValue: { type: Number, default: 0 },
        sellingCommissionType: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'fixed',
        },
        sellingCommissionValue: { type: Number, default: 0 },
        waFollowUp: {
            enabled: { type: Boolean, default: false },
            firstDays: { type: Number, default: 0, min: 0 },
            secondDays: { type: Number, default: 0, min: 0 },
            firstDelayValue: { type: Number, default: 0, min: 0 },
            firstDelayUnit: { type: String, enum: ['minute', 'hour', 'day'], default: 'day' },
            secondDelayValue: { type: Number, default: 0, min: 0 },
            secondDelayUnit: { type: String, enum: ['minute', 'hour', 'day'], default: 'day' },
            firstTemplateId: { type: Schema.Types.ObjectId, ref: 'WaTemplate' },
            secondTemplateId: { type: Schema.Types.ObjectId, ref: 'WaTemplate' },
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        materialsUsed: [{
            product: { type: Schema.Types.ObjectId, ref: 'Product' },
            productName: { type: String },
            quantityPerService: { type: Number, default: 1 },
        }],
        parentService: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
        isFavorite: { type: Boolean, default: false },
        skillName: { type: String, trim: true },
        workServiceId: { type: String, trim: true },
    },
    { timestamps: true }
);

export default mongoose.models.Service || mongoose.model<IService>('Service', serviceSchema);
