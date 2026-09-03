import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const models = {
  Appointment: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  Visit: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  IntegrationIdempotency: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
  Invoice: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateMany: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
  Settings: {
    findOne: vi.fn(),
  },
  CustomerPackage: {
    findOne: vi.fn(),
  },
  PackageUsageLedger: {
    create: vi.fn(),
  },
  Customer: {
    findById: vi.fn(),
  },
  Service: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
  Staff: {
    findOne: vi.fn(),
  },
};

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn(async () => models),
}));

vi.mock('@/lib/invoiceNumber', () => ({
  generateInvoiceNumber: vi.fn(async () => 'INV-TEST-1'),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
}));

describe('Work integration helpers', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORK_BASE_URL = 'http://127.0.0.1:8002';
    process.env.WORK_INTEGRATION_KEY = 'test-work-key';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('rejects inbound callback without key', async () => {
    const { POST } = await import('@/app/api/integrations/work/wo-events/route');
    const req = new NextRequest('http://localhost/api/integrations/work/wo-events', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: 'a1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('unauthorized');
  });

  it('unlocks POS after Work completes without finishing the appointment', async () => {
    const { applyWoCompleted } = await import('@/lib/workIntegration');
    models.IntegrationIdempotency.findOne.mockResolvedValue(null);
    models.Appointment.findById.mockResolvedValue({
      _id: 'a1',
      status: 'processing',
    });
    models.Visit.findOne.mockResolvedValue({ _id: 'v1', status: 'in_progress' });
    models.Appointment.findByIdAndUpdate.mockResolvedValue({});
    models.Visit.findByIdAndUpdate.mockResolvedValue({});
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    models.Invoice.findOne.mockResolvedValue(null);
    models.Invoice.updateMany.mockResolvedValue({});
    models.Invoice.create.mockResolvedValue({ _id: 'inv-draft' });
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.IntegrationIdempotency.create.mockResolvedValue({});

    const result = await applyWoCompleted('pusat', {
      appointment_id: 'a1',
      wo_id: 'wo-1',
      wo_number: 42,
      event: 'completed',
      jobs: [],
      idempotency_key: 'k1',
    });
    expect(result.statusCode).toBe(200);
    expect(result.body.event).toBe('ready_for_pos');
    const completeCall = models.Appointment.findByIdAndUpdate.mock.calls.find(
      (c: any[]) => c[1]?.$set?.status === 'completed'
    );
    expect(completeCall).toBeFalsy();
  });

  it('creates a draft invoice for a processing appointment', async () => {
    const { ensureDraftInvoice } = await import('@/lib/workIntegration');
    models.Invoice.findOne.mockResolvedValue(null);
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Invoice.create.mockResolvedValue({ _id: 'd1', status: 'draft' });
    await ensureDraftInvoice('pusat', {
      _id: 'a1',
      customer: 'c1',
      discount: 0,
      services: [{ service: 's1', name: 'Hairspa', price: 100 }],
    }, { wo_id: 'wo-1', wo_number: '1041' });
    expect(models.Invoice.create).toHaveBeenCalled();
    const created = models.Invoice.create.mock.calls[0][0];
    expect(created.status).toBe('draft');
    expect(created.items[0].name).toBe('Hairspa');
    expect(created.workOrderNumber).toBe('1041');
  });

  it('replays duplicate WO events via idempotency key', async () => {
    const { applyWoEvent } = await import('@/lib/workIntegration');
    models.IntegrationIdempotency.findOne.mockResolvedValue({
      statusCode: 200,
      body: { ok: true, appointment_id: 'a1', event: 'assigned' },
    });
    const result = await applyWoEvent('pusat', { appointment_id: 'a1', idempotency_key: 'dup' });
    expect(result.replayed).toBe(true);
    expect(models.Appointment.findById).not.toHaveBeenCalled();
  });

  it('adds an accepted WO addon onto the draft even if the same service already exists', async () => {
    const { applyAddonWorking } = await import('@/lib/workIntegration');
    const invoice = {
      items: [{ item: 's1', name: 'Cut', fukomoLineId: 'orig:s1:0', total: 100, staffAssignments: [] }],
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    };
    models.Appointment.findById.mockResolvedValue({
      _id: 'a1',
      services: [{ service: 's1', fukomoLineId: 'orig:s1:0' }],
      tax: 0,
      discount: 0,
      save: vi.fn(),
    });
    models.Service.findById.mockResolvedValue({ _id: 's1', name: 'Cut', price: 120, duration: 45 });
    models.Service.findOne.mockResolvedValue({ _id: 's1', name: 'Cut', price: 120, duration: 45 });
    models.Invoice.findOne.mockResolvedValue(invoice);
    models.Staff.findOne.mockResolvedValue({ _id: 'st1', name: 'Andi' });
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    const res = await applyAddonWorking('pusat', {
      appointment_id: 'a1',
      wo_id: 'wo-1',
      wo_number: '1041',
      line: { line_id: 'addon:j2', name: 'Cut', fukomo_service_id: 's1', is_addon: true },
      performers: [{ staff_name: 'Andi', status: 'accepted' }],
      referrer: { staff_name: 'Andi' },
    });
    expect(res.statusCode).toBe(200);
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[1].fukomoLineId).toBe('addon:j2');
    expect(invoice.items[1].lockedFromWork).toBe(true);
    expect(invoice.items[1].staffAssignments[0].staff).toBe('st1');
    expect(invoice.items[1].sellingBy).toBe('st1');
    expect(invoice.save).toHaveBeenCalled();
  });

  it('does not overwrite existing draft items when ensuring a draft', async () => {
    const { ensureDraftInvoice } = await import('@/lib/workIntegration');
    const existing = {
      _id: 'inv1',
      workOrderId: 'wo-1',
      workOrderNumber: '1041',
      items: [{ name: 'Cut', performerNames: 'Andi', lockedFromWork: true }],
    };
    models.Invoice.findOne.mockResolvedValue(existing);
    await ensureDraftInvoice('pusat', {
      _id: 'a1',
      customer: 'c1',
      services: [{ service: 's1', name: 'Cut', price: 100 }],
    }, { wo_id: 'wo-1', wo_number: '1041' });
    expect(models.Invoice.create).not.toHaveBeenCalled();
    expect(models.Invoice.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('matches Work service names that include a duration suffix', async () => {
    const { applyAddonWorking } = await import('@/lib/workIntegration');
    const invoice = {
      items: [],
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    };
    models.Appointment.findById.mockResolvedValue({
      _id: 'a1',
      services: [],
      tax: 0,
      discount: 0,
      save: vi.fn(),
    });
    models.Invoice.findOne.mockResolvedValue(invoice);
    models.Service.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 's-akar', name: 'Akar', price: 675000, duration: 60 });
    models.Staff.findOne.mockResolvedValue({ _id: 'st1', name: 'Sari' });
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    const res = await applyAddonWorking('pusat', {
      appointment_id: 'a1',
      line: { line_id: 'addon:j9', name: 'Akar (675)', work_service_id: 'work-svc', is_addon: true },
      performers: [{ staff_name: 'Sari', status: 'accepted' }],
    });
    expect(res.statusCode).toBe(200);
    expect(invoice.items[0].name).toBe('Akar');
    expect(invoice.items[0].performerNames).toBe('Sari');
    expect(invoice.items[0].lockedFromWork).toBe(true);
  });

  it('replaces an existing draft line in place without duplicating', async () => {
    const { applyAddonWorking } = await import('@/lib/workIntegration');
    const invoice = {
      items: [{
        item: 's1', name: 'Cut', price: 100, quantity: 1, discount: 0, total: 100,
        fukomoLineId: 'a1:s1:0', lockedFromWork: true, staffAssignments: [], workHistory: [],
      }],
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    };
    models.Appointment.findById.mockResolvedValue({
      _id: 'a1',
      services: [{ service: 's1', name: 'Cut', fukomoLineId: 'a1:s1:0' }],
      tax: 0,
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    });
    models.Service.findById.mockResolvedValue({ _id: 's2', name: 'Color', price: 250000, duration: 90 });
    models.Service.findOne.mockResolvedValue({ _id: 's2', name: 'Color', price: 250000, duration: 90 });
    models.Invoice.findOne.mockResolvedValue(invoice);
    models.Staff.findOne.mockResolvedValue(null);
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    const res = await applyAddonWorking('pusat', {
      appointment_id: 'a1',
      wo_id: 'wo-1',
      line: { line_id: 'a1:s1:0', name: 'Color', fukomo_service_id: 's2' },
    });
    expect(res.statusCode).toBe(200);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].name).toBe('Color');
    expect(invoice.items[0].price).toBe(250000);
    expect(invoice.items[0].workHistory.some((h: any) => h.event === 'replaced')).toBe(true);
  });

  it('marks a removed WO line on the draft without deleting history', async () => {
    const { applyAddonWorking } = await import('@/lib/workIntegration');
    const invoice = {
      items: [{
        item: 's1', name: 'Cut', price: 100, quantity: 1, discount: 0, total: 100,
        fukomoLineId: 'addon:j2', lockedFromWork: true, workHistory: [{ event: 'added', note: 'addon' }],
      }],
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    };
    models.Invoice.findOne.mockResolvedValue(invoice);
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    const res = await applyAddonWorking('pusat', {
      appointment_id: 'a1',
      event: 'line_removed',
      line: { line_id: 'addon:j2' },
    });
    expect(res.statusCode).toBe(200);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].removedFromWork).toBe(true);
    expect(invoice.items[0].quantity).toBe(0);
    expect(invoice.items[0].workHistory.some((h: any) => h.event === 'removed')).toBe(true);
  });

  it('does not add a duplicate invoice line when the same line_id is synced twice', async () => {
    const { applyAddonWorking } = await import('@/lib/workIntegration');
    const invoice = {
      items: [{
        item: 's9', name: 'Akar', price: 675000, quantity: 1, discount: 0, total: 675000,
        fukomoLineId: 'addon:j9', lockedFromWork: true, staffAssignments: [], workHistory: [],
      }],
      discount: 0,
      save: vi.fn(),
      markModified: vi.fn(),
    };
    models.Appointment.findById.mockResolvedValue({
      _id: 'a1',
      services: [{ service: 's9', name: 'Akar', fukomoLineId: 'addon:j9' }],
      tax: 0, discount: 0, save: vi.fn(),
    });
    models.Service.findById.mockResolvedValue({ _id: 's9', name: 'Akar', price: 675000, duration: 60 });
    models.Service.findOne.mockResolvedValue({ _id: 's9', name: 'Akar', price: 675000, duration: 60 });
    models.Invoice.findOne.mockResolvedValue(invoice);
    models.Staff.findOne.mockResolvedValue(null);
    models.Settings.findOne.mockResolvedValue({ taxRate: 0 });
    models.Visit.findOneAndUpdate.mockResolvedValue({});
    const res = await applyAddonWorking('pusat', {
      appointment_id: 'a1',
      line: { line_id: 'addon:j9', name: 'Akar', fukomo_service_id: 's9', is_addon: true },
    });
    expect(res.statusCode).toBe(200);
    expect(invoice.items).toHaveLength(1);
  });
});

describe('Package redeem guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks redeem when linked appointment is cancelled', async () => {
    const { POST } = await import('@/app/api/customer-packages/redeem/route');
    models.Invoice.findById.mockResolvedValue({ appointment: 'a1' });
    models.Appointment.findById.mockResolvedValue({ status: 'cancelled' });
    const req = new NextRequest('http://localhost/api/customer-packages/redeem', {
      method: 'POST',
      headers: { 'x-store-slug': 'test-tenant' },
      body: JSON.stringify({
        customerId: '64a1b2c3d4e5f6a7b8c9d0e1',
        invoiceId: '64a1b2c3d4e5f6a7b8c9d0e2',
        items: [{ customerPackageId: '64a1b2c3d4e5f6a7b8c9d0e3', serviceId: '64a1b2c3d4e5f6a7b8c9d0e4', quantity: 1 }],
      }),
    });
    const res = await POST(req, {});
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/dibatalkan|no-show/i);
  });

  it('allows redeem after WO is complete even if appointment is still processing', async () => {
    const { POST } = await import('@/app/api/customer-packages/redeem/route');
    models.Invoice.findById.mockResolvedValue({ appointment: 'a1' });
    models.Appointment.findById.mockResolvedValue({ status: 'processing', workSyncStatus: 'completed' });
    models.CustomerPackage.findOne.mockResolvedValue({
      _id: '64a1b2c3d4e5f6a7b8c9d0e3',
      packageName: 'Cut 10x',
      serviceQuotas: [{ service: '64a1b2c3d4e5f6a7b8c9d0e4', serviceName: 'Haircut', remainingQuota: 10, usedQuota: 0, totalQuota: 10 }],
      save: vi.fn(),
    });
    models.PackageUsageLedger.create.mockResolvedValue({});
    const req = new NextRequest('http://localhost/api/customer-packages/redeem', {
      method: 'POST',
      headers: { 'x-store-slug': 'test-tenant' },
      body: JSON.stringify({
        customerId: '64a1b2c3d4e5f6a7b8c9d0e1',
        invoiceId: '64a1b2c3d4e5f6a7b8c9d0e2',
        items: [{ customerPackageId: '64a1b2c3d4e5f6a7b8c9d0e3', serviceId: '64a1b2c3d4e5f6a7b8c9d0e4', quantity: 1 }],
      }),
    });
    const res = await POST(req, {});
    expect(res.status).toBe(200);
  });
});
