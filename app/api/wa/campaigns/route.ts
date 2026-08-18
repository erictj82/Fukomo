import { getTenantModels } from "@/lib/tenantDb";
import { validateWhatsAppNumber } from '@/lib/fonnte';
import { decryptFonnteToken } from '@/lib/encryption';
import { NextRequest, NextResponse } from 'next/server';

import { checkPermissionWithSession } from '@/lib/rbac';
import { normalizeIndonesianPhone } from '@/lib/phone';
import { getWaProviderConfigForPurpose } from '@/lib/waProvider';
import { resolveCampaignTemplate } from '@/lib/waCampaignTemplate';


// GET: Fetch upcoming campaigns
export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, WaCampaignQueue } = await getTenantModels(tenantSlug);

    const { error: permError } = await checkPermissionWithSession(request, 'customers', 'view');
    if (permError) return permError;

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        const campaigns = await WaCampaignQueue.find({
            status: { $in: ['pending', 'processing'] }
        })
        .sort({ scheduledAt: 1 })
        .limit(limit)
        .populate('sentBy', 'name')
        .lean();

        return NextResponse.json({ success: true, data: campaigns });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Create a new scheduled campaign
export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, WaCampaignQueue, Settings, WaTemplate } = await getTenantModels(tenantSlug);

    // [B14 FIX] Gunakan checkPermissionWithSession — 1 auth() call
    const { error: permError, session } = await checkPermissionWithSession(request, 'customers', 'edit');
    if (permError) return permError;

    try {
        const settings = await Settings.findOne({}).lean();
        const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
        const body = await request.json();
        const { customerIds, message, campaignName, scheduledAt, filters, templateId, templateValues } = body;

        if (!message?.trim()) {
            return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
        }
        if (!customerIds?.length) {
            return NextResponse.json({ success: false, error: 'No customers selected' }, { status: 400 });
        }
        if (!scheduledAt) {
            return NextResponse.json({ success: false, error: 'Schedule time is required' }, { status: 400 });
        }

        // Resolusi + validasi template WABA. Menolak blast WABA tanpa template approved
        // (sebelumnya silent-fail lewat endpoint free-text di luar window 24 jam).
        const tplResult = await resolveCampaignTemplate({ WaTemplate, waConfig, templateId, templateValues });
        if (!tplResult.ok) {
            return NextResponse.json({ success: false, error: tplResult.error }, { status: 400 });
        }

        // [B14 FIX] session diambil dari checkPermissionWithSession di atas
        
        // Find customers to get their phone numbers
        const customers = await Customer.find({
            _id: { $in: customerIds },
            phone: { $exists: true, $ne: '' },
            waNotifEnabled: true,
        }).select('phone').lean();

        if (customers.length === 0) {
            return NextResponse.json({ success: false, error: 'None of the selected customers have valid phone numbers or WA enabled' }, { status: 400 });
        }

        // FLOW-08 FIX: Limit max target per campaign
        const MAX_TARGETS = 500;
        if (customers.length > MAX_TARGETS) {
            return NextResponse.json({
                success: false,
                error: `Terlalu banyak target (${customers.length}). Maksimal ${MAX_TARGETS} per campaign.`
            }, { status: 400 });
        }

        const targets = customers.map((c: any) => ({
            customerId: c._id,
            phone: normalizeIndonesianPhone(c.phone),
            status: 'pending',
        }));

        const scheduleDate = new Date(scheduledAt);
        // Ensure schedule is not in the past by more than 5 minutes
        if (scheduleDate.getTime() < Date.now() - 5 * 60000) {
            return NextResponse.json({ success: false, error: 'Cannot schedule in the past' }, { status: 400 });
        }

        const campaign = await WaCampaignQueue.create({
            campaignName: campaignName || `Campaign ${new Date().toLocaleDateString('id-ID')}`,
            message,
            scheduledAt: scheduleDate,
            filters: filters || {},
            targets,
            sentBy: (session as any)?.user?.id,
            status: 'pending',
            ...(tplResult.template ? {
                waTemplateName: tplResult.template.waTemplateName,
                waTemplateLanguage: tplResult.template.waTemplateLanguage,
                waTemplateVariables: tplResult.template.waTemplateVariables,
                waTemplateValues: tplResult.template.waTemplateValues,
            } : {}),
        });

        return NextResponse.json({
            success: true,
            data: campaign,
            message: `Campaign scheduled successfully for ${targets.length} customers`
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE: Cancel an upcoming campaign
export async function DELETE(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, WaCampaignQueue } = await getTenantModels(tenantSlug);

    const { error: permError } = await checkPermissionWithSession(request, 'customers', 'edit');
    if (permError) return permError;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });

        
        
        const campaign = await WaCampaignQueue.findById(id);
        if (!campaign) {
            return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
        }

        if (['completed', 'processing'].includes(campaign.status)) {
            return NextResponse.json({ 
                success: false, 
                error: campaign.status === 'processing' 
                    ? 'Campaign sedang diproses. Tunggu selesai.' 
                    : 'Tidak bisa membatalkan campaign yang sudah selesai.' 
            }, { status: 400 });
        }

        await WaCampaignQueue.findByIdAndDelete(id);

        return NextResponse.json({ success: true, message: 'Campaign cancelled successfully' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
