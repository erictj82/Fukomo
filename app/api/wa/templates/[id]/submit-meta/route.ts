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
        const fbResponse = result.data?.fb_response;
        const reviewStatus = fbResponse?.status === 'APPROVED' ? 'APPROVED' : 'PENDING';
        template.metaStatus = reviewStatus;
        template.metaTemplateName = cleanName;
        if (fbResponse?.id) template.metaTemplateId = fbResponse.id;
        await template.save();

        const reviewNotice = result.data?.review_notice_message 
            ? ` ${result.data.review_notice_message}` 
            : ' Meta biasanya memerlukan 10 menit hingga maks 3 hari untuk review template.';

        return NextResponse.json({
            success: true,
            message: `Template berhasil diajukan ke Meta WABA! Status: ${reviewStatus === 'APPROVED' ? 'Disetujui' : 'Sedang Ditinjau (In Review)'}.${reviewNotice}`,
            data: template,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Gagal memproses pengajuan template WABA' },
            { status: 500 }
        );
    }
}
