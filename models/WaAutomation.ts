import mongoose, { Schema, Document } from "mongoose";

export interface IWaAutomation extends Document {
  name: string;
  category: 'daily_report' | 'stock_alert' | 'membership_expiry' | 'package_expiry' | 'birthday';
  targetRole: 'owner' | 'admin' | 'customer';
  frequency: 'daily' | 'weekly' | 'monthly';
  scheduleDays?: number[]; // For weekly: [1=Mon..7=Sun], for monthly: [1..28]
  scheduleTime?: string; // HH:mm format, e.g., "21:00"
  daysBefore?: number; // E.g., 7 for "7 days before expiry"
  messageTemplate: string;
  // Opsional: link ke WaTemplate (Meta-approved) untuk kategori customer-facing
  // (membership_expiry / package_expiry / birthday). Kalau ter-set DAN tenant pakai
  // BalesOtomatis WABA, scheduler kirim via Send Template (bukan free-text Fonnte) —
  // reminder & ultah hampir selalu di luar window 24 jam sehingga free-text ditolak.
  // Kalau kosong → jalur lama (Fonnte free-text) dipertahankan, NON-REGRESI.
  waTemplateId?: mongoose.Types.ObjectId;
  isActive: boolean;
  lastRunDate?: Date; // To prevent double execution on the same day
  createdAt: Date;
  updatedAt: Date;
}

const waAutomationSchema = new Schema<IWaAutomation>(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['daily_report', 'stock_alert', 'membership_expiry', 'package_expiry', 'birthday'],
      required: true,
    },
    targetRole: {
      type: String,
      enum: ['owner', 'admin', 'customer'],
      required: true,
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily',
    },
    scheduleDays: [{ type: Number }],
    scheduleTime: { type: String, trim: true },
    daysBefore: { type: Number, min: 0 },
    messageTemplate: { type: String, required: true },
    waTemplateId: { type: Schema.Types.ObjectId, ref: 'WaTemplate' },
    isActive: { type: Boolean, default: true },
    lastRunDate: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.WaAutomation ||
  mongoose.model<IWaAutomation>("WaAutomation", waAutomationSchema);
