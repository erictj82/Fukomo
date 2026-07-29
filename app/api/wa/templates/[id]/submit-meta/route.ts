import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose, createBalesOtomatisTemplate } from '@/lib/waProvider';

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'waTemplates', 'edit');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const template = await WaTemplate.findById(id);
        if (!template) {
            return NextResponse.json({ success: false, error: 'Template tidak ditemukan' }, { status: 404 });
        }

        const settings = await Settings.findOne({}).lean();
        const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');

        if (waConfig.provider !== 'balesotomatis' || waConfig.balesotomatis?.mode !== 'waba') {
            return NextResponse.json({
                success: false,
                error: 'WhatsApp Business API (WABA) belum aktif di Pengaturan -> WhatsApp Provider.',
            });
        }

        const { secretKey, licensesKey } = waConfig.balesotomatis;
        const result = await createBalesOtomatisTemplate(
            secretKey,
            licensesKey,
            template.name,
            template.message,
            template.metaCategory || 'UTILITY',
            template.metaLanguage || 'id'
        );

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || 'Gagal mengajukan template ke Meta.',
            }, { status: 400 });
        }

        const cleanName = template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        template.metaStatus = 'PENDING';
        template.metaTemplateName = cleanName;
        await template.save();

        return NextResponse.json({
            success: true,
            message: 'Template berhasil diajukan ke server Meta WABA! Status saat ini: Sedang Ditinjau (Pending).',
            data: template,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Gagal memproses pengajuan template WABA' },
            { status: 500 }
        );
    }
}
