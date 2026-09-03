import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';
import { applyApprovedCorrection } from '@/lib/corrections';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'approve');
    if (error) return error;
    const { id } = await props.params;
    const { CorrectionRequest } = await getTenantModels(tenantSlug);
    const doc = await CorrectionRequest.findById(id);
    if (!doc) return NextResponse.json({ success: false, error: 'Correction request tidak ditemukan.' }, { status: 404 });
    if (doc.status !== 'pending') {
        return NextResponse.json({ success: false, error: `Request sudah ${doc.status}.` }, { status: 400 });
    }

    const applied = await applyApprovedCorrection(tenantSlug, doc.toObject(), {
        id: session.user.id,
        name: session.user.name || session.user.email,
    });
    if (!applied.ok) {
        return NextResponse.json({ success: false, error: applied.error }, { status: applied.status || 502 });
    }

    doc.status = 'approved';
    doc.reviewedBy = session.user.id;
    doc.reviewedByName = session.user.name || session.user.email;
    doc.reviewedAt = new Date();
    if (applied.work?.correction?.fukomo_line_id) {
        doc.fukomoLineId = applied.work.correction.fukomo_line_id;
    }
    if (applied.work?.correction?.job_id) {
        doc.jobId = applied.work.correction.job_id;
    }
    await doc.save();

    return NextResponse.json({
        success: true,
        data: doc,
        work: applied.work,
        woStatus: applied.work?.wo_status,
    });
}
