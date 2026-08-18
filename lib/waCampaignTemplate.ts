import type { WaProviderConfig } from '@/lib/waProvider';
import { extractTemplateVariables } from '@/lib/waProvider';

/**
 * Resolusi & validasi template WABA untuk pembuatan campaign/blast.
 *
 * Dipakai bareng oleh POST /api/wa/campaigns dan POST /api/wa/blast-targets supaya
 * aturan "blast WABA WAJIB pakai template approved" konsisten di dua entry point.
 *
 * Aturan:
 *  - Kalau `templateId` dikasih -> template harus ADA & metaStatus === 'APPROVED'
 *    (Meta menolak kirim via template yang belum approved), dan config campaign harus
 *    resolve ke BalesOtomatis WABA.
 *  - Kalau config campaign = BalesOtomatis WABA TAPI tanpa templateId -> DITOLAK, karena
 *    free-text WABA di luar window 24 jam pasti gagal (silent-fail sebelumnya). Beri pesan
 *    jelas supaya user pilih/registrasi template dulu.
 *  - Selain itu (Fonnte / unofficial) -> return null (jalur free-text lama, tanpa template).
 */
export interface ResolvedTemplate {
    waTemplateName: string;
    waTemplateLanguage: string;
    waTemplateVariables: string[];
    waTemplateValues: Record<string, string>;
}

export interface ResolveTemplateResult {
    ok: boolean;
    error?: string;
    template?: ResolvedTemplate | null;
}

export async function resolveCampaignTemplate(opts: {
    WaTemplate: any;
    waConfig: WaProviderConfig;
    templateId?: string;
    templateValues?: Record<string, string>;
}): Promise<ResolveTemplateResult> {
    const { WaTemplate, waConfig, templateId, templateValues } = opts;

    const isWaba = waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba';

    if (!templateId) {
        if (isWaba) {
            return {
                ok: false,
                error:
                    'Blast via WhatsApp Business API (WABA) wajib memakai template yang sudah DISETUJUI Meta. ' +
                    'Pilih template approved, atau daftarkan template baru di menu Template WhatsApp terlebih dahulu.',
            };
        }
        // Fonnte / unofficial -> free-text, tidak pakai template.
        return { ok: true, template: null };
    }

    // templateId dikasih -> wajib WABA + approved.
    if (!isWaba) {
        return {
            ok: false,
            error: 'Template WABA hanya bisa dipakai saat provider campaign diset ke BalesOtomatis WABA.',
        };
    }

    const tpl = await WaTemplate.findById(templateId).lean();
    if (!tpl) {
        return { ok: false, error: 'Template tidak ditemukan.' };
    }
    if (tpl.metaStatus !== 'APPROVED') {
        return {
            ok: false,
            error: `Template "${tpl.name}" belum disetujui Meta (status: ${tpl.metaStatus || 'LOCAL'}). ` +
                'Hanya template berstatus APPROVED yang bisa dipakai untuk blast.',
        };
    }

    const waTemplateName = tpl.metaTemplateName || String(tpl.name).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const variables =
        Array.isArray(tpl.metaVariables) && tpl.metaVariables.length > 0
            ? tpl.metaVariables
            : extractTemplateVariables(tpl.message || '');

    // Normalisasi key values ke lowercase supaya cocok dgn lookup di buildTemplateParameters.
    const values: Record<string, string> = {};
    if (templateValues && typeof templateValues === 'object') {
        for (const [k, v] of Object.entries(templateValues)) {
            values[String(k).toLowerCase()] = String(v ?? '');
        }
    }

    return {
        ok: true,
        template: {
            waTemplateName,
            waTemplateLanguage: tpl.metaLanguage || 'id',
            waTemplateVariables: variables,
            waTemplateValues: values,
        },
    };
}
