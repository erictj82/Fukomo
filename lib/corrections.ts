/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTenantModels } from '@/lib/tenantDb';
import {
    hasNamedCorrectionPermission,
    notificationPreview,
} from '@/lib/correctionPerms';
import {
    applyApprovedCorrectionToWork,
    applyLineToDraftInvoice,
    removeLineFromDraftInvoice,
} from '@/lib/workIntegration';

export async function notifyCorrectionApprovers(tenantSlug: string, doc: any) {
    const { User, AppNotification } = await getTenantModels(tenantSlug);
    const users = await User.find({}).populate('role').lean();
    const href = '/corrections';
    const title = 'Correction Request baru';
    const body = notificationPreview(doc);
    const payload = {
        customer: doc.customerName,
        wo: doc.workOrderNumber || doc.workOrderId,
        fromService: doc.fromServiceName,
        toService: doc.toServiceName,
        reason: doc.reason,
        requestedBy: doc.requestedByName,
        action: doc.action,
        correctionId: String(doc._id),
    };
    const requesterId = doc.requestedBy ? String(doc.requestedBy) : '';
    const rows = (users || [])
        .filter((u: any) => {
            if (requesterId && String(u._id) === requesterId) return false;
            return hasNamedCorrectionPermission(u.role?.permissions, u.role, 'APPROVE_CORRECTION');
        })
        .map((u: any) => ({
            user: u._id,
            type: 'correction_request',
            title,
            body,
            href,
            payload,
        }));
    if (rows.length) await AppNotification.insertMany(rows);
    return rows.length;
}

export async function applyApprovedCorrection(tenantSlug: string, doc: any, reviewer: { id?: string; name?: string }) {
    const work = await applyApprovedCorrectionToWork(tenantSlug, {
        appointment_id: String(doc.appointment),
        wo_id: doc.workOrderId,
        action: doc.action,
        fukomo_line_id: doc.fukomoLineId,
        job_id: doc.jobId,
        fukomo_service_id: doc.toServiceId,
        name: doc.toServiceName,
        reason: doc.reason,
        correction_id: String(doc._id),
        requested_by: {
            id: doc.requestedBy ? String(doc.requestedBy) : undefined,
            name: doc.requestedByName,
        },
        approved_by: { id: reviewer.id, name: reviewer.name },
    });
    if (work.status >= 400) {
        const msg = work.json?.error?.message || work.json?.error || 'Gagal menerapkan koreksi ke Work.';
        return { ok: false as const, status: work.status, error: String(msg) };
    }
    const lineId = work.json?.correction?.fukomo_line_id || doc.fukomoLineId;
    const aptId = String(doc.appointment);
    try {
        if (doc.action === 'remove') {
            await removeLineFromDraftInvoice(tenantSlug, aptId, {
                line: { line_id: lineId },
                note: doc.reason,
                wo_id: doc.workOrderId,
                wo_number: doc.workOrderNumber,
            });
        } else if (lineId && doc.toServiceId) {
            await applyLineToDraftInvoice(tenantSlug, aptId, {
                wo_id: doc.workOrderId,
                wo_number: doc.workOrderNumber,
                line: {
                    line_id: lineId,
                    fukomo_service_id: doc.toServiceId,
                    name: doc.toServiceName,
                    is_addon: doc.action === 'add' || String(lineId).startsWith('addon:'),
                },
            });
        }
    } catch (e) {
        console.error('[corrections] local draft sync after Work apply failed', e);
    }
    return { ok: true as const, work: work.json };
}
