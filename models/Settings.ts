import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
    storeName: {
        type: String,
        required: [true, 'Store name is required'],
        default: 'SalonNext'
    },
    address: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        default: ''
    },
    website: {
        type: String,
        default: ''
    },
    taxId: {
        type: String,
        default: ''
    },
    currency: {
        type: String,
        default: 'IDR'
    },
    timezone: {
        type: String,
        default: 'Asia/Jakarta'
    },
    taxRate: {
        type: Number,
        default: 0
    },
    logoUrl: {
        type: String,
        default: ''
    },
    businessHours: {
        type: String,
        default: 'Mon-Fri: 9:00 AM - 6:00 PM'
    },
    receiptFooter: {
        type: String,
        default: 'Thank you for your business!'
    },
    receiptQrType: {
        type: String,
        enum: ['digital_receipt', 'custom', 'hidden'],
        default: 'digital_receipt'
    },
    customReceiptQrLink: {
        type: String,
        default: ''
    },
    showStaffOnReceipt: {
        type: Boolean,
        default: true
    },
    showTaxAndTaxableAmountOnReceipt: {
        type: Boolean,
        default: true
    },
    stockAdjustmentPassword: {
        type: String,
        default: ''
    },
    bankTransferPassword: {
        type: String,
        default: ''
    },
    ownerTransferPassword: {
        type: String,
        default: ''
    },
    // Password cetak ulang nota/invoice — kosong = fitur mati (cetak ulang bebas).
    reprintInvoicePassword: {
        type: String,
        default: ''
    },
    // Sumber akuisisi / "mengetahui dari" (marketing funnel). Daftar KOSONG = fitur mati
    // (field POS tak wajib/tak muncul). Owner isi sendiri per kebutuhan marketing.
    acquisitionSources: {
        type: [String],
        default: []
    },
    showCommissionInPOS: {
        type: Boolean,
        default: false
    },
    // Wallet Bonus Tiers (top-up bonus %)
    walletBonusTiers: [{
        minAmount: { type: Number, required: true },
        bonusPercent: { type: Number, required: true }
    }],
    walletIncludedServices: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    }],
    walletIncludedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    walletIncludedBundles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceBundle'
    }],
    termsAndConditions: {
        type: String,
        default: ''
    },
    allowStaffDoubleBooking: {
        type: Boolean,
        default: false
    },
    walletExpiryDays: { type: Number, default: 0 },
    financialReportSections: {
        totalSales: { type: Boolean, default: true },
        totalCollected: { type: Boolean, default: true },
        purchases: { type: Boolean, default: true },
        expenses: { type: Boolean, default: true },
        payroll: { type: Boolean, default: false },
        walletTopups: { type: Boolean, default: false },
        netProfit: { type: Boolean, default: true },
        cashFlow: { type: Boolean, default: true },
    },

    fonnteToken: {
        type: String,
        default: ''
    },
    // Tanggal nomor Fonnte didaftarkan — untuk kalkulasi warm-up limit
    fonnteDeviceRegisteredAt: {
        type: Date,
    },
    // Provider WA yang dipakai tenant ini buat kirim pesan (lib/waProvider.ts yang baca ini).
    // Default 'fonnte' biar tenant lama yang belum pernah isi field ini tetap jalan seperti biasa.
    waProvider: {
        type: String,
        enum: ['fonnte', 'balesotomatis'],
        default: 'balesotomatis',
    },
    // Mode Hybrid: Fonnte untuk notifikasi harian (nota, reminder, follow-up), 
    // BalesOtomatis WABA untuk campaign & marketing blast. Hemat biaya!
    waHybridMode: {
        type: Boolean,
        default: false,
    },
    // BalesOtomatis.id punya 2 mode koneksi yang auth & endpoint-nya BEDA (lihat lib/waProvider.ts):
    // 'unofficial' = scan QR (apiKey + numberId), 'waba' = WhatsApp Business API resmi (secretKey + licensesKey)
    balesotomatisMode: {
        type: String,
        enum: ['unofficial', 'waba'],
        default: 'unofficial',
    },
    balesotomatisApiKey: { type: String, default: '' },      // mode unofficial
    balesotomatisNumberId: { type: String, default: '' },    // mode unofficial — id device yang tersambung QR
    balesotomatisSecretKey: { type: String, default: '' },   // mode waba
    balesotomatisLicensesKey: { type: String, default: '' }, // mode waba
    // Override manual max pesan per hari (0 = auto berdasarkan umur nomor)
    fonnteMaxDailyMessages: {
        type: Number,
        default: 0,
        min: 0
    },
    // Jam operasional pengiriman WA blast/campaign (WIB)
    waOperationalHoursStart: {
        type: Number,
        default: 8,
        min: 0,
        max: 23
    },
    waOperationalHoursEnd: {
        type: Number,
        default: 20,
        min: 0,
        max: 23
    },
    // WA Marketing Numbers
    waBlastNumber: {
        type: String,
        default: ''
    },
    waAdminNumber: {
        type: String,
        default: ''
    },
    waOwnerNumber: {
        type: String,
        default: ''
    },
    // WA Auto-Reminder Settings
    greetingEnabled: {
        type: Boolean,
        default: true
    },
    // WA Auto-Reminder Settings
    membershipExpiryReminderDays: {
        type: Number,
        default: 30,
        min: 1
    },
    packageExpiryReminderDays: {
        type: Number,
        default: 30,
        min: 1
    },
    dailyReportTime: {
        type: String,
        default: '21:00'
    },
    waMembershipReminderTime: {
        type: String,
        default: '09:00'
    },
    waPackageReminderTime: {
        type: String,
        default: '09:30'
    },
    waStockAlertTime: {
        type: String,
        default: '08:00'
    },
    waBirthdayNotifTime: {
        type: String,
        default: '08:00'
    },
    // WA Message Templates
    waTemplateStockAlert: {
        type: String,
        default: '⚠️ *Notifikasi Stok Rendah — {{storeName}}*\n\nAda {{count}} produk yang stoknya hampir habis:\n\n{{productList}}\n\nSegera lakukan restok! 📦'
    },
    waTemplateDailyReport: {
        type: String,
        default: '📊 *Laporan Harian — {{storeName}}*\n📅 {{date}}\n\n💰 Total Pendapatan: Rp{{totalAmount}}\n🧾 Jumlah Transaksi: {{totalTransactions}}\n👥 Pelanggan Dilayani: {{totalCustomers}}\n\nTerima kasih! 🙏'
    },
    waTemplateMembershipExpiry: {
        type: String,
        default: 'Halo {{customerName}} 👋\n\nMembership *{{membershipTier}}* Anda di *{{storeName}}* akan berakhir dalam *{{daysLeft}} hari* ({{expiryDate}}).\n\nSegera perpanjang agar tetap menikmati benefit spesial! ✨'
    },
    waTemplatePackageExpiry: {
        type: String,
        default: 'Halo {{customerName}} 👋\n\nPaket *{{packageName}}* Anda di *{{storeName}}* akan berakhir dalam *{{daysLeft}} hari* ({{expiryDate}}).\nSisa kuota: {{remainingQuota}}\n\nSegera gunakan sebelum hangus! 💆'
    },
    // SMS Settings (Twilio)
    smsEnabled: {
        type: Boolean,
        default: false
    },
    twilioAccountSid: {
        type: String,
        default: ''
    },
    twilioAuthToken: {
        type: String,
        default: ''
    },
    twilioPhoneNumber: {
        type: String,
        default: ''
    },
    // Email Settings (SMTP)
    emailEnabled: {
        type: Boolean,
        default: false
    },
    smtpHost: {
        type: String,
        default: ''
    },
    smtpPort: {
        type: Number,
        default: 587
    },
    smtpSecure: {
        type: Boolean,
        default: false
    },
    smtpUser: {
        type: String,
        default: ''
    },
    smtpPassword: {
        type: String,
        default: ''
    },
    smtpFrom: {
        type: String,
        default: ''
    },
    // Reminder Settings
    reminderDaysBefore: {
        type: Number,
        default: 1
    },
    reminderMethod: {
        type: String,
        enum: ['sms', 'email', 'both'],
        default: 'both'
    },
    // AI Settings
    aiEnabled: {
        type: Boolean,
        default: false
    },
    openaiApiKey: {
        type: String,
        default: ''
    },
    openaiModel: {
        type: String,
        default: 'gpt-4o'
    },
    // Premium Membership Settings
    membershipPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    membershipDurationDays: {
        type: Number,
        default: 365,
        min: 1
    },
    loyaltyPointPerSpend: {
        type: Number,
        default: 0,
        min: 0
    },
    loyaltyPointValue: {
        type: Number,
        default: 0,
        min: 0
    },
    // Referral Rewards
    referralRewardPoints: {
        type: Number,
        default: 0,
        min: 0
    },
    // Referral Discount for the customer who uses a referral code
    referralDiscountType: {
        type: String,
        enum: ['percentage', 'nominal'],
        default: 'nominal'
    },
    referralDiscountValue: {
        type: Number,
        default: 0,
        min: 0
    },
    birthdayVoucherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Voucher'
    },
    // Member Discount Defaults
    memberDiscountType: {
        type: String,
        enum: ['percentage', 'nominal'],
        default: 'percentage'
    },
    memberDiscountValue: {
        type: Number,
        default: 0,
        min: 0
    },
    // Included items for membership benefit
    memberIncludedServices: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    }],
    memberIncludedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    memberIncludedBundles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceBundle'
    }],
    // WA Appointment Reminder
    waAppointmentReminderEnabled: { type: Boolean, default: false },
    waAppointmentReminderMinutesBefore: { type: Number, default: 60 },
    waAppointmentReminderDefaultTemplate: {
      type: String,
      default: 'Halo {{customerName}} 👋\n\nIni reminder, Anda ada janji di *{{storeName}}* hari ini:\n📅 {{date}} pukul *{{time}}*\nLayanan: {{services}}\nStaff: {{staffName}}\n\nSampai jumpa! 💆'
    },
    // WA Nota
    waNotaTemplate: {
      type: String,
      default: '🧾 *NOTA TRANSAKSI*\n*{{storeName}}*\n{{storeAddress}}\n\nNo: {{invoiceNumber}}\nTanggal: {{date}}\nKasir: {{staffName}}\n\n{{items}}\n\nSubtotal: {{subtotal}}\nDiskon: {{discount}}\n*TOTAL: {{total}}*\nBayar: {{amountPaid}}\nKembalian: {{change}}\n\nTerima kasih, {{customerName}}! 🙏\n{{receiptFooter}}'
    },
    waAdminNotaPrefix: {
      type: String,
      default: '📋 *LAPORAN TRANSAKSI BARU*\n'
    },
    // Auto-backup terjadwal (permintaan klien): sampai 3 slot jam/hari, harian atau mingguan.
    // Backup full-DB disimpan gzip ke disk luar app-tree + rotasi otomatis; download via UI (per
    // rentang tanggal), TIDAK dikirim ke mana-mana. enabled=false atau times kosong = fitur mati.
    backupSchedule: {
        enabled: { type: Boolean, default: false },
        frequency: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
        // 0=Minggu .. 6=Sabtu (WIB) — hanya dipakai saat frequency 'weekly'
        dayOfWeek: { type: Number, min: 0, max: 6, default: 1 },
        // maksimal 3, format "HH:MM" WIB (divalidasi & dipangkas di PUT /api/settings)
        times: { type: [String], default: [] },
        // simpan N backup terbaru per tenant; sisanya dirotasi (hapus otomatis)
        retentionCount: { type: Number, default: 14, min: 1, max: 90 },
    },
}, {
    timestamps: true
});

// Force re-register model on hot-reload so schema changes (like new fonnteToken field) take effect
if (mongoose.models.Settings) {
    delete mongoose.models.Settings;
}
const Settings = mongoose.model('Settings', SettingsSchema);

export default Settings;
