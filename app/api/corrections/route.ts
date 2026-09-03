/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';
import { isPrivilegedRole, hasNamedCorrectionPermission, validateCorrectionCreate } from '@/lib/correctionPerms';
import { notifyCorrectionApprovers } from '@/lib/corrections';

export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'view');
    if (error) return error;
    const { CorrectionRequest } = await getTenantModels(tenantSlug);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const query: any = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) query.status = status;

    const role = session.user.role;
    const perms = session.user.permissions;
    if (!isPrivilegedRole(role) && !hasNamedCorrectionPermission(perms, role, 'APPROVE_CORRECTION')) {
        query.requestedBy = session.user.id;
    }

    const rows = await CorrectionRequest.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'request');
    if (error) return error;
    const body = await request.json().catch(() => ({}));
    const invalid = validateCorrectionCreate(body);
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

    const { CorrectionRequest, Appointment, Invoice, Service } = await getTenantModels(tenantSlug);
    const apt = await Appointment.findById(body.appointmentId).populate('customer', 'name phone');
    if (!apt) return NextResponse.json({ success: false, error: 'Appointment tidak ditemukan.' }, { status: 404 });
    if (!apt.workOrderId) {
        return NextResponse.json({ success: false, error: 'Appointment ini belum punya Work Order.' }, { status: 400 });
    }

    let fromServiceName = String(body.fromServiceName || '').trim();
    let fromServiceId = String(body.fromServiceId || '').trim();
    let toServiceName = String(body.toServiceName || '').trim();
    const toServiceId = body.toServiceId ? String(body.toServiceId) : '';
    const fukomoLineId = body.fukomoLineId ? String(body.fukomoLineId) : '';

    if (fukomoLineId) {
        const invoice = await Invoice.findOne({
            appointment: apt._id,
            status: { $in: ['draft', 'pending'] },
        }).lean();
        const item = (invoice?.items || []).find((it: any) => it.fukomoLineId === fukomoLineId);
        if (item) {
            fromServiceName = fromServiceName || item.name;
            fromServiceId = fromServiceId || String(item.item || '');
        } else {
            const aptLine = (apt.services || []).find((s: any) => s.fukomoLineId === fukomoLineId);
            if (aptLine) {
                fromServiceName = fromServiceName || aptLine.name;
                fromServiceId = fromServiceId || String(aptLine.service || '');
            }
        }
    }

    if (toServiceId && !toServiceName) {
        const svc = await Service.findById(toServiceId).lean();
        toServiceName = svc?.name || toServiceName;
    }

    const customer = apt.customer as any;
    const doc = await CorrectionRequest.create({
        appointment: apt._id,
        workOrderId: apt.workOrderId,
        workOrderNumber: apt.workOrderNumber,
        customer: customer?._id || apt.customer,
        customerName: customer?.name || '',
        action: body.action,
        fukomoLineId,
        jobId: body.jobId || '',
        fromServiceId,
        fromServiceName,
        toServiceId,
        toServiceName,
        reason: String(body.reason).trim(),
        status: 'pending',
        requestedBy: session.user.id,
        requestedByName: session.user.name || session.user.email,
        requestedAt: new Date(),
    });

    try {
        await notifyCorrectionApprovers(tenantSlug, doc.toObject ? doc.toObject() : doc);
    } catch (e) {
        console.error('[corrections] notify failed', e);
    }

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
}
