import { getTenantModels } from "@/lib/tenantDb";
/**
 * GET  /api/wa/blast-targets — Filter customers for WA blast
 * POST /api/wa/blast-targets — Send WA blast to filtered customers
 */
import { NextRequest, NextResponse } from 'next/server';

import { checkPermissionWithSession } from '@/lib/rbac';
import { normalizeIndonesianPhone } from '@/lib/phone';

import { validateWhatsAppNumber } from '@/lib/fonnte';
import { decryptFonnteToken } from '@/lib/encryption';
import { validateMessageContent } from '@/lib/messageValidator';
import { getWaProviderConfigForPurpose } from '@/lib/waProvider';

/* ------------------------------------------------------------------ */
/*  GET — Filter customers for blast preview                           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, Invoice, WaBlastLog } = await getTenantModels(tenantSlug);

    const { error: permError } = await checkPermissionWithSession(request, 'customers', 'view');
    if (permError) return permError;

    const { searchParams } = new URL(request.url);
    const lastVisitSince = searchParams.get('lastVisitSince');
    const serviceId = searchParams.get('serviceId');
    const membershipTier = searchParams.get('membershipTier');
    const birthdayMonth = searchParams.get('birthdayMonth');
    const search = searchParams.get('search');
    const hasPhone = searchParams.get('hasPhone') !== 'false'; // default true

    try {
        // Start with all active customers with phone
        const customerQuery: any = { status: 'active', waNotifEnabled: true };
        if (hasPhone) {
            customerQuery.phone = { $exists: true, $ne: '' };
        }
        if (membershipTier) {
            customerQuery.membershipTier = membershipTier;
        }
        if (search) {
            customerQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        let customerIds: string[] | null = null;

        // Filter by last visit (invoice date)
        if (lastVisitSince) {
            const sinceDate = new Date(lastVisitSince);
            const invoiceQuery: any = {
                date: { $gte: sinceDate },
                status: 'paid',
            };
            if (serviceId) {
                invoiceQuery['items.item'] = serviceId;
                invoiceQuery['items.itemModel'] = 'Service';
            }
            const invoices = await Invoice.find(invoiceQuery)
                .select('customer')
                .lean();
            customerIds = [...new Set(invoices.map((inv: any) => String(inv.customer)))];
        } else if (serviceId) {
            // Filter by service without date constraint
            const invoices = await Invoice.find({
                'items.item': serviceId,
                'items.itemModel': 'Service',
                status: 'paid',
            })
                .select('customer')
                .lean();
            customerIds = [...new Set(invoices.map((inv: any) => String(inv.customer)))];
        }

        if (customerIds !== null) {
            customerQuery._id = { $in: customerIds };
        }

        // Birthday month filter
        if (birthdayMonth) {
            const month = parseInt(birthdayMonth);
            if (month >= 1 && month <= 12) {
                // MongoDB aggregation for birthday month
                const customersWithBirthday = await Customer.aggregate([
                    { $match: { ...customerQuery, birthday: { $exists: true, $ne: null } } },
                    { $addFields: { bdayMonth: { $month: '$birthday' } } },
                    { $match: { bdayMonth: month } },
                    { $project: { name: 1, email: 1, phone: 1, membershipTier: 1, birthday: 1, waNotifEnabled: 1 } },
                ]);
                return NextResponse.json({
                    success: true,
                    data: customersWithBirthday,
                    total: customersWithBirthday.length,
                });
            }
        }

        const customers = await Customer.find(customerQuery)
            .select('name email phone membershipTier birthday waNotifEnabled')
            .sort({ name: 1 })
            .lean();

        return NextResponse.json({
            success: true,
            data: customers,
            total: customers.length,
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/* ------------------------------------------------------------------ */
/*  POST — Queue WA blast to selected customers (async via scheduler)  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, WaCampaignQueue, Settings } = await getTenantModels(tenantSlug);

    // [B14 FIX] Gunakan checkPermissionWithSession — 1 auth() call
    const { error: permError, session } = await checkPermissionWithSession(request, 'customers', 'edit');
    if (permError) return permError;

    const settings = await Settings.findOne({}).lean();
    const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');

    const body = await request.json();
    const { customerIds, message, campaignName, filters } = body;

    if (!message?.trim()) {
        return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }
    if (!customerIds?.length) {
        return NextResponse.json({ success: false, error: 'No customers selected' }, { status: 400 });
    }

    // Validate message content for spam risk
    const validation = validateMessageContent(message);

    const customers = await Customer.find({
        _id: { $in: customerIds },
        phone: { $exists: true, $ne: '' },
        waNotifEnabled: true,
    })
        .select('name phone')
        .lean();

    if (customers.length === 0) {
        return NextResponse.json({ success: false, error: 'Tidak ada customer yang memiliki nomor WA valid' }, { status: 400 });
    }

    // FLOW-08 FIX: Limit max target per campaign (B-10)
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
        status: 'pending' as const,
    }));

    // BLAST-01 FIX: Masukkan ke queue, bukan kirim langsung
    // Scheduler akan pickup di tick berikutnya (~1 menit)
    const campaign = await WaCampaignQueue.create({
        campaignName: campaignName || `Blast ${new Date().toLocaleDateString('id-ID')}`,
        message,
        scheduledAt: new Date(), // langsung eligible untuk diproses
        filters: filters || {},
        targets,
        sentBy: (session as any)?.user?.id,
        status: 'pending',
    });

    return NextResponse.json({
        success: true,
        queued: true,
        message: `${targets.length} pesan dijadwalkan. Akan dikirim otomatis dalam beberapa menit.`,
        campaignId: campaign._id,
        targetCount: targets.length,
        contentWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    });
}
