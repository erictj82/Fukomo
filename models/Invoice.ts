import mongoose, { Schema, Document } from "mongoose";

export interface IInvoice extends Document {
  invoiceNumber: string;
  customer: mongoose.Types.ObjectId;
  appointment?: mongoose.Types.ObjectId;
  items: {
    item: mongoose.Types.ObjectId; // Service or Product ID
    itemModel: "Service" | "Product" | "TopUp" | "ServicePackage";
    name: string;
    price: number;
    quantity: number;
    discount: number; // Amount
    discountNote?: string;
    total: number;
    sellingBy?: mongoose.Types.ObjectId;
    sellingCommission?: number;
    splitCommissionMode?: "auto" | "manual";
    staffAssignments?: {
      staff?: mongoose.Types.ObjectId;
      staffId?: mongoose.Types.ObjectId;
      percentage?: number;
      porsiPersen?: number;
      commission?: number;
      komisiNominal?: number;
      tip?: number;
    }[];
  }[];
  subtotal: number;
  tax: number;
  discount: number; // Global discount
  totalAmount: number;
  amountPaid: number;
  tips: number;
  paymentMethod: string; // Cash, Card, etc.
  paymentMethods?: {
    method: string;
    amount: number;
  }[];
  loyaltyPointsUsed?: number;
  loyaltyPointsEarned?: number;
  status: "paid" | "pending" | "partially_paid" | "cancelled" | "voided";
  voidedBy?: mongoose.Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;
  staff?: mongoose.Types.ObjectId;
  staffAssignments: {
    staff?: mongoose.Types.ObjectId;
    staffId?: mongoose.Types.ObjectId;
    percentage?: number;
    porsiPersen?: number;
    commission?: number;
    komisiNominal?: number;
    tip: number;
  }[];
  commission: number;
  notes?: string;
  medicalNotes?: string;
  followUpPhoneNumber?: string;
  sourceType: "normal_sale" | "package_redeem" | "package_purchase" | "membership_purchase";
  // Sumber akuisisi / "mengetahui dari" (marketing funnel). Snapshot teks bebas
  // dari daftar Settings.acquisitionSources. Optional: jalur non-POS & data lama
  // tak mengisi ini (masuk bucket "Belum diisi" di report).
  acquisitionSource?: string;
  date: Date;
  discountBreakdown?: {
    manual: number;
    manualReason?: string;
    loyalty: number;
    referral: number;
    voucher: number;
  };
  packageUsage?: {
    itemName: string;
    packageName: string;
    usedQuantity: number;
    remainingQuota: number;
    expiryDate?: Date;
  }[];
  // Reprint control (anti-kecurangan cetak ulang nota)
  printCount?: number;
  firstPrintedAt?: Date;
  lastPrintedAt?: Date;
  reprintLogs?: {
    at: Date;
    byId?: string;
    byName?: string;
    method?: string;
  }[];
}

const ALLOWED_SPLIT_ERROR = 0.01;

const toNum = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizedPercentage = (entry: any): number => {
  return toNum(entry?.porsiPersen ?? entry?.percentage);
};

const normalizedStaffKey = (entry: any): string => {
  const id = entry?.staffId ?? entry?.staff;
  return id ? String(id) : "";
};

const hasDuplicateStaff = (assignments: any[] = []): boolean => {
  const ids = assignments
    .map((entry) => normalizedStaffKey(entry))
    .filter(Boolean);
  return ids.length !== new Set(ids).size;
};

const hasValidTotalPercentage = (assignments: any[] = []): boolean => {
  if (!assignments.length) return true;
  const total = assignments.reduce(
    (sum, entry) => sum + normalizedPercentage(entry),
    0,
  );
  return Math.abs(total - 100) <= ALLOWED_SPLIT_ERROR;
};

// Porsi 0% diperbolehkan: staff yang mengerjakan service komisi 0 / harga 0
// (gratis/bundle/manual) ikut tercatat di split walau proporsi komisinya 0.
// Hanya porsi NEGATIF yang ditolak. Total tetap wajib 100% (lihat
// hasValidTotalPercentage) sehingga tidak mungkin semua porsi 0.
const hasNoNegativePercentages = (assignments: any[] = []): boolean => {
  return assignments.every((entry) => normalizedPercentage(entry) >= 0);
};

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    appointment: { type: Schema.Types.ObjectId, ref: "Appointment" },
    items: [
      {
        item: {
          type: Schema.Types.ObjectId,
          required: function(this: any) { return this.itemModel !== 'TopUp'; },
          refPath: "items.itemModel",
        },
        itemModel: {
          type: String,
          required: true,
          enum: ["Service", "Product", "TopUp", "ServicePackage"],
        },
        name: String,
        price: Number,
        quantity: { type: Number, default: 1 },
        discount: { type: Number, default: 0 },
        discountNote: { type: String },
        total: Number,
        sellingBy: { type: Schema.Types.ObjectId, ref: "Staff" },
        sellingCommission: { type: Number, default: 0 },
        splitCommissionMode: {
          type: String,
          enum: ["auto", "manual"],
          default: "auto",
        },
        staffAssignments: [
          {
            staff: { type: Schema.Types.ObjectId, ref: "Staff" },
            staffId: { type: Schema.Types.ObjectId, ref: "Staff" },
            percentage: { type: Number, default: 0 },
            porsiPersen: { type: Number, default: 0 },
            commission: { type: Number, default: 0 },
            komisiNominal: { type: Number, default: 0 },
            tip: { type: Number, default: 0 },
          },
        ],
      },
    ],
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    tips: { type: Number, default: 0 },
    paymentMethod: { type: String, default: "Cash" },
    paymentMethods: [
      {
        method: { type: String, required: true },
        amount: { type: Number, default: 0 },
      },
    ],
    loyaltyPointsUsed: { type: Number, default: 0 },
    loyaltyPointsEarned: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["paid", "pending", "partially_paid", "cancelled", "voided"],
      default: "paid",
    },
    // Immutable audit trail — invoices are NEVER hard-deleted
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },
    staff: { type: Schema.Types.ObjectId, ref: "Staff" },
    staffAssignments: [
      {
        staff: { type: Schema.Types.ObjectId, ref: "Staff" },
        staffId: { type: Schema.Types.ObjectId, ref: "Staff" },
        percentage: { type: Number, default: 0 },
        porsiPersen: { type: Number, default: 0 },
        commission: { type: Number, default: 0 },
        komisiNominal: { type: Number, default: 0 },
        tip: { type: Number, default: 0 },
      },
    ],
    commission: { type: Number, default: 0 },
    notes: String,
    medicalNotes: String,
    followUpPhoneNumber: {
      type: String,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ["normal_sale", "package_redeem", "package_purchase", "membership_purchase"],
      default: "normal_sale",
    },
    acquisitionSource: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now },
    discountBreakdown: {
      manual: { type: Number, default: 0 },
      manualReason: { type: String },
      loyalty: { type: Number, default: 0 },
      referral: { type: Number, default: 0 },
      voucher: { type: Number, default: 0 },
    },
    packageUsage: [
      {
        itemName: String,
        packageName: String,
        usedQuantity: Number,
        remainingQuota: Number,
        expiryDate: Date,
      }
    ],
    // Reprint control (anti-kecurangan): cetak PERTAMA gratis, cetak ULANG butuh
    // Settings.reprintInvoicePassword. printCount naik tiap print; reprintLogs = jejak
    // siapa/kapan/metode cetak ulang. Enforcement di /api/invoices/[id]/reprint.
    printCount: { type: Number, default: 0 },
    firstPrintedAt: { type: Date },
    lastPrintedAt: { type: Date },
    reprintLogs: [
      {
        at: { type: Date, default: Date.now },
        byId: { type: String },
        byName: { type: String },
        method: { type: String },
      },
    ],
  },
  { timestamps: true },
);

invoiceSchema.path("staffAssignments").validate({
  validator(value: any[] = []) {
    if (!Array.isArray(value)) return false;
    if (hasDuplicateStaff(value)) return false;
    if (!hasNoNegativePercentages(value)) return false;
    return hasValidTotalPercentage(value);
  },
  message:
    "staffAssignments must not contain duplicate staff, each percentage must be zero or positive, and total percentage must equal 100",
});

invoiceSchema.path("items").validate({
  validator(items: any[] = []) {
    if (!Array.isArray(items)) return false;

    return items.every((item) => {
      const assignments = item?.staffAssignments || [];
      if (!Array.isArray(assignments) || assignments.length === 0) return true;
      if (hasDuplicateStaff(assignments)) return false;
      if (!hasNoNegativePercentages(assignments)) return false;
      return hasValidTotalPercentage(assignments);
    });
  },
  message:
    "Service item staff split must not contain duplicate staff, each percentage must be zero or positive, and total percentage must equal 100",
});

invoiceSchema.pre("validate", function preValidate() {
  this.staffAssignments = (this.staffAssignments || []).map(
    (assignment: any) => {
      const staffId = assignment.staffId || assignment.staff;
      const porsiPersen = toNum(
        assignment.porsiPersen ?? assignment.percentage,
      );
      const komisiNominal = toNum(
        assignment.komisiNominal ?? assignment.commission,
      );

      return {
        ...assignment,
        staff: staffId,
        staffId,
        percentage: porsiPersen,
        porsiPersen,
        commission: komisiNominal,
        komisiNominal,
      };
    },
  );

  this.items = (this.items || []).map((item: any) => {
    const staffAssignments = (item.staffAssignments || []).map(
      (assignment: any) => {
        const staffId = assignment.staffId || assignment.staff;
        const porsiPersen = toNum(
          assignment.porsiPersen ?? assignment.percentage,
        );
        const komisiNominal = toNum(
          assignment.komisiNominal ?? assignment.commission,
        );

        return {
          ...assignment,
          staff: staffId,
          staffId,
          percentage: porsiPersen,
          porsiPersen,
          commission: komisiNominal,
          komisiNominal,
        };
      },
    );

    return {
      ...item,
      splitCommissionMode: item.splitCommissionMode || "auto",
      staffAssignments,
    };
  });
});

// Optimize query performance
invoiceSchema.index({ date: 1, status: 1 });
invoiceSchema.index({ customer: 1 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models.Invoice;
}

export default mongoose.models.Invoice ||
  mongoose.model<IInvoice>("Invoice", invoiceSchema);
