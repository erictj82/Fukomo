/**
 * Excel catalog: Fukomo layanan → Work (kategori skill = skill Work).
 * Header names must stay in sync with Work SERVICE_IMPORT_HEADERS / aliases.
 */
import * as XLSX from 'xlsx';

export const WORK_SERVICE_EXPORT_HEADERS = [
    'fukomo_service_id',
    'nama_layanan',
    'kategori_skill',
    'durasi_menit',
    'harga',
    'harga_member',
    'komisi_tipe',
    'komisi_nilai',
    'komisi_jual_tipe',
    'komisi_jual_nilai',
    'deskripsi',
    'status',
] as const;

export type WorkServiceExportRow = {
    fukomo_service_id: string;
    nama_layanan: string;
    kategori_skill: string;
    durasi_menit: number | string;
    harga: number | string;
    harga_member: number | string;
    komisi_tipe: string;
    komisi_nilai: number | string;
    komisi_jual_tipe: string;
    komisi_jual_nilai: number | string;
    deskripsi: string;
    status: string;
};

const INSTRUCTIONS: string[][] = [
    ['Kolom', 'Wajib', 'Keterangan'],
    ['fukomo_service_id', 'YA — jangan diubah', 'ID tautan Fukomo ↔ Work. Jangan edit.'],
    ['nama_layanan', 'YA', 'Nama jasa.'],
    ['kategori_skill', 'YA', 'Kategori skill Fukomo. Di Work jadi Skill. Skill baru dibuat otomatis saat upload.'],
    ['durasi_menit', 'YA', 'Durasi treatment (menit). Disimpan di Work untuk peringatan overtime nanti.'],
    ['harga', 'YA', 'Harga regular. Disimpan di katalog Work.'],
    ['harga_member', 'Tidak', 'Harga member Fukomo (opsional).'],
    ['komisi_tipe', 'Tidak', 'fixed atau percentage (komisi pengerjaan).'],
    ['komisi_nilai', 'Tidak', 'Nilai komisi pengerjaan.'],
    ['komisi_jual_tipe', 'Tidak', 'fixed atau percentage (komisi penjualan).'],
    ['komisi_jual_nilai', 'Tidak', 'Nilai komisi penjualan.'],
    ['deskripsi', 'Tidak', 'Deskripsi layanan.'],
    ['status', 'Tidak', 'active atau inactive.'],
    [],
    ['Cara pakai'],
    ['1. Di Fukomo, rapikan Kategori Skill dulu (tab Kategori Skill).'],
    ['2. Unduh untuk Work.'],
    ['3. Jangan ubah fukomo_service_id. Kategori skill boleh diedit di Excel jika perlu.'],
    ['4. Di Work → Layanan → Upload Excel, unggah file yang sama.'],
];

export function buildWorkServiceExportBook(rows: WorkServiceExportRow[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    const header = [...WORK_SERVICE_EXPORT_HEADERS];
    const data = rows.map((r) => header.map((h) => (r as any)[h] ?? ''));
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!cols'] = header.map((h) => ({
        wch: h === 'fukomo_service_id' ? 28
            : h === 'nama_layanan' || h === 'deskripsi' ? 32
            : h === 'kategori_skill' ? 22
            : 16,
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Layanan');

    const instr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
    instr['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instr, 'Petunjuk');
    return wb;
}

export function workServiceExportBuffer(rows: WorkServiceExportRow[]): Buffer {
    const wb = buildWorkServiceExportBook(rows);
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function serviceDocToExportRow(doc: any): WorkServiceExportRow {
    return {
        fukomo_service_id: String(doc._id || ''),
        nama_layanan: doc.name || '',
        kategori_skill: doc.category?.name || '',
        durasi_menit: doc.duration ?? '',
        harga: doc.price ?? '',
        harga_member: doc.memberPrice ?? '',
        komisi_tipe: doc.commissionType || '',
        komisi_nilai: doc.commissionValue ?? '',
        komisi_jual_tipe: doc.sellingCommissionType || '',
        komisi_jual_nilai: doc.sellingCommissionValue ?? '',
        deskripsi: doc.description || '',
        status: String(doc.status || '') === 'inactive' ? 'inactive' : 'active',
    };
}
