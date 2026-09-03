/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';
import { fetchWorkOrderSnapshot } from '@/lib/workIntegration';
import { fallbackAppointmentLines, linesFromWorkJobs } from '@/lib/correctionLines';

export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error } = await requireCorrectionAccess(request, 'view');
    if (error) return error;
    const { Appointment, Invoice, Service } = await getTenantModels(tenantSlug);

    const apts = await Appointment.find({
        workOrderId: { $exists: true, $nin: [null, ''] },
        $or: [
            { workSyncStatus: 'completed' },
            { status: 'completed' },
        ],
    })
        .sort({ updatedAt: -1 })
        .limit(80)
        .populate('customer', 'name phone')
        .lean();

    const aptIds = apts.map((a: any) => a._id);
    const woIds = apts.map((a: any) => String(a.workOrderId || '')).filter(Boolean);
    const invoices = await Invoice.find({
        appointment: { $in: aptIds },
        status: { $in: ['draft', 'pending'] },
    }).lean();
    const invByApt = new Map<string, any>();
    for (const inv of invoices) {
        invByApt.set(String(inv.appointment), inv);
    }

    let jobsByWo: Record<string, unknown[]> = {};
    try {
        const snap = await fetchWorkOrderSnapshot(tenantSlug, woIds);
        jobsByWo = snap.jobs_by_wo || {};
    } catch (e) {
        console.error('[corrections] WO snapshot failed', e);
    }

    const data = apts.map((apt: any) => {
        const woJobs = jobsByWo[String(apt.workOrderId)] || [];
        let lines = linesFromWorkJobs(woJobs);
        if (!lines.length) {
            const inv = invByApt.get(String(apt._id));
            const invLines = (inv?.items || [])
                .filter((it: any) => !it.removedFromWork)
                .map((it: any, i: number) => ({
                    fukomoLineId: String(it.fukomoLineId || '').trim() || `inv:${apt._id}:${i}`,
                    jobId: '',
                    serviceId: String(it.item?._id || it.item || ''),
                    workServiceId: '',
                    name: it.name,
                    quantity: it.quantity || 1,
                }))
                .filter((l: any) => l.name);
            lines = invLines.length ? invLines : fallbackAppointmentLines(apt);
        }
        return {
            _id: apt._id,
            customerName: apt.customer?.name || '',
            customerPhone: apt.customer?.phone || '',
            workOrderId: apt.workOrderId,
            workOrderNumber: apt.workOrderNumber,
            status: apt.status,
            workSyncStatus: apt.workSyncStatus,
            date: apt.date,
            lines,
        };
    });

    const services = await Service.find({ status: 'active' })
        .select('name price duration')
        .sort({ name: 1 })
        .limit(500)
        .lean();

    return NextResponse.json({ success: true, data, services });
}
