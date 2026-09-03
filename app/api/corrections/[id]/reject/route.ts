import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'approve');
    if (error) return error;
    const { id } = await props.params;
    const body = await request.json().catch(() => ({}));
    const { CorrectionRequest } = await getTenantModels(tenantSlug);
    const doc = await CorrectionRequest.findById(id);
    if (!doc) return NextResponse.json({ success: false, error: 'Correction request tidak ditemukan.' }, { status: 404 });
    if (doc.status !== 'pending') {
        return NextResponse.json({ success: false, error: `Request sudah ${doc.status}.` }, { status: 400 });
    }

    doc.status = 'rejected';
    doc.rejectReason = String(body?.reason || body?.rejectReason || '').trim();
    doc.reviewedBy = session.user.id;
    doc.reviewedByName = session.user.name || session.user.email;
    doc.reviewedAt = new Date();
    await doc.save();

    return NextResponse.json({ success: true, data: doc });
}
