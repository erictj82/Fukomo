import mongoose, { Document, Schema } from 'mongoose';

export interface IWaTemplateHistoryEntry {
    at: Date;
    // Status Meta pada saat event (mengikuti metaStatus internal).
    status: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED';
    // Jenis event pendaftaran: dibuat & diajukan, diajukan ulang, atau perubahan status hasil sinkron Meta.
    action: 'submitted' | 'status_change' | 'synced';
    // Keterangan human-readable (mis. "Diajukan ke Meta", alasan gagal/ditolak).
    note?: string;
}

export interface IWaTemplate extends Document {
    name: string;
    message: string;
    templateType: 'greeting' | 'follow_up';
    isGreetingEnabled: boolean;
    metaStatus?: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED';
    metaTemplateName?: string;
    metaTemplateId?: string;
    metaCategory?: string;
    metaLanguage?: string;
    metaVariables?: string[];
    // Ikatan ke akun WABA cabang: fingerprint licenses_key + nomor yang tercatat di setting.
    // Kalau setting ganti nomor/kredensial, template lama tidak "menyala" (usable=false).
    wabaPhone?: string;
    wabaLicensesFingerprint?: string;
    // Riwayat pendaftaran template ke Meta (WABA): setiap pengajuan & perubahan status dicatat di sini
    // supaya user bisa lihat kapan template didaftarkan, disetujui, atau ditolak.
    metaHistory?: IWaTemplateHistoryEntry[];
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
        // ID numerik template Meta yang APPROVED (mis. "1027996053304714"), di-resolve dari
        // /get-template-list. Disimpan agar status lokal benar-benar mencerminkan "bisa dikirim"
        // (APPROVED tanpa id = belum sendable) & agar tak perlu resolve ulang tiap kirim.
        metaTemplateId: { type: String, trim: true },
        metaCategory: { type: String, default: 'UTILITY' },
        metaLanguage: { type: String, default: 'id' },
        // Urutan nama variabel asli ({{nama_customer}}, {{nama_service}}, ...) yang dipetakan
        // ke placeholder bernomor {{1}}, {{2}} saat diajukan ke Meta. Dipakai saat blast untuk
        // menyusun `parameters` sesuai urutan yang benar.
        metaVariables: { type: [String], default: undefined },
        wabaPhone: { type: String, trim: true, default: undefined },
        wabaLicensesFingerprint: { type: String, trim: true, default: undefined },
        // Riwayat pendaftaran ke Meta. Disimpan urut kronologis (terlama → terbaru), di-cap oleh
        // appendWaTemplateHistory agar tak tumbuh tak terbatas. _id per entri dimatikan (bukan sub-dokumen mandiri).
        metaHistory: {
            type: [
                new Schema<IWaTemplateHistoryEntry>(
                    {
                        at: { type: Date, required: true },
                        status: { type: String, enum: ['LOCAL', 'PENDING', 'APPROVED', 'REJECTED'], required: true },
                        action: { type: String, enum: ['submitted', 'status_change', 'synced'], required: true },
                        note: { type: String, trim: true },
                    },
                    { _id: false }
                ),
            ],
            default: undefined,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

waTemplateSchema.index({ name: 1 });

export default mongoose.models.WaTemplate || mongoose.model<IWaTemplate>('WaTemplate', waTemplateSchema);
