import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const models: any = {};

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn(async () => models),
}));

vi.mock('@/lib/rbac', () => ({
  requireCorrectionAccess: vi.fn(),
}));

vi.mock('@/lib/corrections', () => ({
  notifyCorrectionApprovers: vi.fn(async () => 1),
  applyApprovedCorrection: vi.fn(),
}));

vi.mock('@/lib/workIntegration', () => ({
  fetchWorkOrderSnapshot: vi.fn(async () => ({ ok: false, jobs_by_wo: {} })),
}));

function jsonReq(url: string, method: string, body?: any, slug = 'pusat') {
  return new NextRequest(url, {
    method,
    headers: { 'x-store-slug': slug, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Correction request API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: null,
      session: { user: { id: 'u-cashier', name: 'Kasir Rina', role: 'Kasir', tenantSlug: 'pusat', permissions: { corrections: { create: true } } } },
    });

    const chain = (doc: any) => ({
      populate: () => Promise.resolve(doc),
      lean: () => Promise.resolve(doc),
    });

    models.Appointment = {
      findById: vi.fn().mockReturnValue(chain({
        _id: 'a1',
        workOrderId: 'wo-1',
        workOrderNumber: '1041',
        customer: { _id: 'c1', name: 'Andi' },
        services: [{ fukomoLineId: 'a1:s1:0', service: 's1', name: 'Cut' }],
      })),
    };
    models.Invoice = {
      findOne: vi.fn().mockReturnValue({
        lean: () => Promise.resolve({
          items: [{ fukomoLineId: 'a1:s1:0', item: 's1', name: 'Cut' }],
        }),
      }),
    };
    models.Service = {
      findById: vi.fn().mockReturnValue({ lean: () => Promise.resolve({ _id: 's2', name: 'Color' }) }),
    };
    models.CorrectionRequest = {
      create: vi.fn().mockImplementation(async (doc: any) => ({
        ...doc,
        _id: 'cr1',
        toObject: () => ({ ...doc, _id: 'cr1' }),
      })),
      find: vi.fn().mockReturnValue({
        sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
      }),
      findById: vi.fn(),
    };
  });

  it('creates a pending correction with required reason and audit fields', async () => {
    const { POST } = await import('@/app/api/corrections/route');
    const { notifyCorrectionApprovers } = await import('@/lib/corrections');
    const res = await POST(jsonReq('http://localhost/api/corrections', 'POST', {
      appointmentId: 'a1',
      action: 'replace',
      fukomoLineId: 'a1:s1:0',
      toServiceId: 's2',
      reason: 'Salah input Cut, seharusnya Color',
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(models.CorrectionRequest.create).toHaveBeenCalled();
    const saved = models.CorrectionRequest.create.mock.calls[0][0];
    expect(saved.status).toBe('pending');
    expect(saved.reason).toBe('Salah input Cut, seharusnya Color');
    expect(saved.workOrderId).toBe('wo-1');
    expect(saved.customerName).toBe('Andi');
    expect(saved.fromServiceName).toBe('Cut');
    expect(saved.toServiceName).toBe('Color');
    expect(saved.requestedBy).toBe('u-cashier');
    expect(notifyCorrectionApprovers).toHaveBeenCalled();
  });

  it('rejects create without reason', async () => {
    const { POST } = await import('@/app/api/corrections/route');
    const res = await POST(jsonReq('http://localhost/api/corrections', 'POST', {
      appointmentId: 'a1',
      action: 'replace',
      fukomoLineId: 'a1:s1:0',
      toServiceId: 's2',
      reason: '',
    }));
    expect(res.status).toBe(400);
  });

  it('denies REQUEST_CORRECTION when permission is missing', async () => {
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: new Response(JSON.stringify({ success: false, error: 'Access Denied: REQUEST_CORRECTION' }), { status: 403 }),
      session: null,
    });
    const { POST } = await import('@/app/api/corrections/route');
    const res = await POST(jsonReq('http://localhost/api/corrections', 'POST', {
      appointmentId: 'a1', action: 'add', toServiceId: 's2', reason: 'tambah',
    }));
    expect(res.status).toBe(403);
  });

  it('owner/manager can approve and keeps audit trail', async () => {
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: null,
      session: { user: { id: 'u-owner', name: 'Owner', role: 'Owner', tenantSlug: 'pusat' } },
    });
    const { applyApprovedCorrection } = await import('@/lib/corrections');
    (applyApprovedCorrection as any).mockResolvedValue({
      ok: true,
      work: { ok: true, wo_status: 'completed', correction: { fukomo_line_id: 'a1:s1:0', job_id: 'j1' } },
    });
    const doc = {
      status: 'pending',
      reason: 'Salah input',
      fukomoLineId: 'a1:s1:0',
      save: vi.fn(),
      toObject: () => ({ status: 'pending', reason: 'Salah input', fukomoLineId: 'a1:s1:0' }),
    };
    models.CorrectionRequest.findById.mockResolvedValue(doc);
    const { POST } = await import('@/app/api/corrections/[id]/approve/route');
    const res = await POST(jsonReq('http://localhost/api/corrections/cr1/approve', 'POST'), { params: Promise.resolve({ id: 'cr1' }) });
    expect(res.status).toBe(200);
    expect(doc.status).toBe('approved');
    expect(doc.reviewedBy).toBe('u-owner');
    expect(doc.reviewedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });

  it('owner/manager can reject with optional reason', async () => {
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: null,
      session: { user: { id: 'u-mgr', name: 'Manager', role: 'Admin', tenantSlug: 'pusat' } },
    });
    const doc = {
      status: 'pending',
      save: vi.fn(),
    };
    models.CorrectionRequest.findById.mockResolvedValue(doc);
    const { POST } = await import('@/app/api/corrections/[id]/reject/route');
    const res = await POST(jsonReq('http://localhost/api/corrections/cr1/reject', 'POST', {}), { params: Promise.resolve({ id: 'cr1' }) });
    expect(res.status).toBe(200);
    expect(doc.status).toBe('rejected');
    expect(doc.rejectReason).toBe('');
    expect(doc.reviewedBy).toBe('u-mgr');
    expect(doc.save).toHaveBeenCalled();
  });

  it('denies APPROVE_CORRECTION for cashier', async () => {
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: new Response(JSON.stringify({ success: false, error: 'Access Denied: APPROVE_CORRECTION' }), { status: 403 }),
      session: null,
    });
    const { POST } = await import('@/app/api/corrections/[id]/approve/route');
    const res = await POST(jsonReq('http://localhost/api/corrections/cr1/approve', 'POST'), { params: Promise.resolve({ id: 'cr1' }) });
    expect(res.status).toBe(403);
  });

  it('isolates tenant slug mismatch', async () => {
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    (requireCorrectionAccess as any).mockResolvedValue({
      error: new Response(JSON.stringify({ success: false, error: 'Access Denied: Store slug mismatch' }), { status: 403 }),
      session: null,
    });
    const { GET } = await import('@/app/api/corrections/route');
    const res = await GET(jsonReq('http://localhost/api/corrections', 'GET', undefined, 'coba1'));
    expect(res.status).toBe(403);
  });

  it('keeps requester fromServiceName over invoice original', async () => {
    const { POST } = await import('@/app/api/corrections/route');
    const res = await POST(jsonReq('http://localhost/api/corrections', 'POST', {
      appointmentId: 'a1',
      action: 'replace',
      fukomoLineId: 'job:job-lina',
      jobId: 'job-lina',
      fromServiceName: 'Collagen Perm L',
      toServiceId: 's2',
      reason: 'Selesai Collagen Perm L, bukan S',
    }));
    expect(res.status).toBe(201);
    const saved = models.CorrectionRequest.create.mock.calls[0][0];
    expect(saved.fromServiceName).toBe('Collagen Perm L');
    expect(saved.jobId).toBe('job-lina');
  });

  it('candidates prefer Work completed service name over booking original', async () => {
    const { fetchWorkOrderSnapshot } = await import('@/lib/workIntegration');
    (fetchWorkOrderSnapshot as any).mockResolvedValue({
      ok: true,
      jobs_by_wo: {
        'wo-1': [{
          id: 'job-lina',
          status: 'completed',
          service_name: 'Collagen Perm L',
          original_service_name: 'Collagen Perm S',
          fukomo_line_id: '',
          fukomo_service_id: 'svc-l',
        }],
      },
    });
    models.Appointment.find = vi.fn().mockReturnValue({
      sort: () => ({
        limit: () => ({
          populate: () => ({
            lean: () => Promise.resolve([{
              _id: 'a-lina',
              workOrderId: 'wo-1',
              workOrderNumber: '1100',
              customer: { name: 'Lina', phone: '081' },
              services: [{ name: 'Collagen Perm S', service: 'svc-s', fukomoLineId: '' }],
              status: 'completed',
              workSyncStatus: 'completed',
            }]),
          }),
        }),
      }),
    });
    models.Invoice.find = vi.fn().mockReturnValue({
      lean: () => Promise.resolve([{
        appointment: 'a-lina',
        items: [{ name: 'Collagen Perm S', fukomoLineId: '', item: 'svc-s' }],
      }]),
    });
    models.Service.find = vi.fn().mockReturnValue({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([{ _id: 'svc-l', name: 'Collagen Perm L' }]),
          }),
        }),
      }),
    });
    const { GET } = await import('@/app/api/corrections/candidates/route');
    const res = await GET(jsonReq('http://localhost/api/corrections/candidates', 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].lines[0].name).toBe('Collagen Perm L');
    expect(body.data[0].lines[0].fukomoLineId).toBe('job:job-lina');
    expect(body.data[0].lines[0].jobId).toBe('job-lina');
  });
});
