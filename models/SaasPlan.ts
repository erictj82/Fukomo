import { Schema } from 'mongoose';

// Client final decision (chat 1/7 & 2/7):
// - Tiap plan (Starter/Standard/Enterprise) punya harga beda-beda per periode
//   langganan (bulanan / 6 bulanan / tahunan) -> pricingOptions array, bukan 1 harga statis.
// - Add-on TIDAK cuma buat kuota WA, tapi bisa buat staff & transaksi juga -> availableAddOns
//   pakai limitType generik, bukan field khusus `extraWaQuota`.

export type SaasBillingPeriod = 'monthly' | 'semiannual' | 'annual';
export type SaasLimitType = 'staff' | 'transaction' | 'wa';

export interface ISaasPlanPricingOption {
    billingPeriod: SaasBillingPeriod;
    billingPeriodDays: number; // 30 / 180 / 365 (dibikin eksplisit biar gampang ubah tanpa nebak dari enum)
    price: number;
    discountLabel?: string; // contoh: "Hemat 15%" buat ditampilin di halaman upgrade
}

export interface ISaasPlanAddOn {
    _id?: string;
    name: string; // contoh: "Tambahan 5 staff", "Tambahan 500 transaksi", "Tambahan 200 pesan WA"
    limitType: SaasLimitType;
    extraAmount: number; // jumlah tambahan kuota yang didapat per pembelian add-on ini
    price: number;
    isActive: boolean;
}

export interface ISaasPlan {
    _id: string;
    name: string; // "Starter" | "Standard" | "Enterprise" (bebas diedit admin)
    code: string; // slug unik, dipakai referensi internal (bukan buat ditampilin)
    description?: string;
    limits: {
        maxStaff: number;
        maxTransactionsPerMonth: number;
        maxWaMessagesPerMonth: number;
    };
    pricingOptions: ISaasPlanPricingOption[];
    availableAddOns: ISaasPlanAddOn[];
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const SaasPlanPricingOptionSchema = new Schema<ISaasPlanPricingOption>(
    {
        billingPeriod: {
            type: String,
            enum: ['monthly', 'semiannual', 'annual'],
            required: true,
        },
        billingPeriodDays: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        discountLabel: {
            type: String,
            trim: true,
        },
    },
    { _id: false }
);

const SaasPlanAddOnSchema = new Schema<ISaasPlanAddOn>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        limitType: {
            type: String,
            enum: ['staff', 'transaction', 'wa'],
            required: true,
        },
        extraAmount: {
            type: Number,
            required: true,
            min: 1,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    }
);

export const SaasPlanSchema = new Schema<ISaasPlan>(
    {
        name: {
            type: String,
            required: [true, 'Nama plan wajib diisi'],
            trim: true,
        },
        code: {
            type: String,
            required: [true, 'Kode plan wajib diisi'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[a-z0-9-]+$/, 'Code hanya boleh huruf kecil, angka, dan strip'],
        },
        description: {
            type: String,
            trim: true,
        },
        limits: {
            // -1 = unlimited, 0 = fitur mati, >0 = batas beneran. min:-1 supaya sentinel
            // unlimited kesimpen tapi angka < -1 (gak ada artinya) tetep ditolak.
            maxStaff: { type: Number, required: true, min: -1 },
            maxTransactionsPerMonth: { type: Number, required: true, min: -1 },
            maxWaMessagesPerMonth: { type: Number, required: true, min: -1 },
        },
        pricingOptions: {
            type: [SaasPlanPricingOptionSchema],
            default: [],
            validate: {
                validator: (v: ISaasPlanPricingOption[]) => v.length > 0,
                message: 'Minimal 1 opsi harga (billing period) wajib diisi',
            },
        },
        availableAddOns: {
            type: [SaasPlanAddOnSchema],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

export default SaasPlanSchema;
