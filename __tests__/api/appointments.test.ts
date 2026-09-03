import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_ALL, POST } from '@/app/api/appointments/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/appointments/[id]/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { scheduleFollowUp } from '@/lib/waFollowUp';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Appointment: {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      aggregate: vi.fn(),
    },
    Invoice: {
      findOne: vi.fn(),
      create: vi.fn(),
      countDocuments: vi.fn(),
      find: vi.fn(),
      updateMany: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
    Deposit: {
      find: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
    Settings: {
      findOne: vi.fn(),
    },
    Staff: {},
    Service: {
      findById: vi.fn(),
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    // generateInvoiceNumber() (POST + PUT invoice creation) re-reads models and uses Counter.
    Counter: {
      findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
    // DELETE refunds any deposits to the customer wallet before voiding.
    Customer: {
      findByIdAndUpdate: vi.fn(),
    },
    WalletTransaction: {
      create: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/errorHandler', () => ({
  handleApiError: vi.fn().mockImplementation((ctx, err) => {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }),
}));

vi.mock('@/lib/waFollowUp', () => ({
  scheduleFollowUp: vi.fn(),
}));

vi.mock('@/lib/workIntegration', () => ({
  shouldSkipAutoInvoice: vi.fn(() => false),
  afterAppointmentSaved: vi.fn(async () => null),
  ensureDraftInvoice: vi.fn(),
}));

describe('Appointments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/appointments', () => {
    it('should return 403 if permission denied', async () => {
      (checkPermission as any).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
      const req = new NextRequest('http://localhost/api/appointments', {
        headers: { 'x-store-slug': 'test-tenant' },
      });
      const res = await GET_ALL(req, {});
      expect(res.status).toBe(403);
    });

    it('should return paginated appointments', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Appointment.aggregate as any)
        .mockResolvedValueOnce([{ total: 1 }]) // Count pipeline
        .mockResolvedValueOnce([{ _id: '1', status: 'confirmed' }]); // Data pipeline

      const req = new NextRequest('http://localhost/api/appointments?page=1&limit=10', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ALL(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.pagination.total).toBe(1);
    });
  });

  describe('POST /api/appointments', () => {
    it('should return 400 if required fields are missing', async () => {
      const req = new NextRequest('http://localhost/api/appointments', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({}),
      });

      const res = await POST(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should create an appointment and its invoice if confirmed', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Settings.findOne as any).mockResolvedValue({ taxRate: 10 });
      (models.Service.findById as any).mockResolvedValue({ commissionValue: 5 });
      
      const mockAppointment = {
        _id: 'a1',
        status: 'confirmed',
        customer: 'c1',
        staff: 's1',
        services: [{ service: 'svc1', price: 100 }]
      };
      (models.Appointment.create as any).mockResolvedValue(mockAppointment);
      
      (models.Invoice.findOne as any).mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
      });
      (models.Invoice.create as any).mockResolvedValue({ _id: 'inv1' });

      const payload = {
        customer: 'c1',
        staff: 's1',
        startTime: '10:00',
        status: 'confirmed',
        services: [{ service: 'svc1', price: 100, duration: 30 }]
      };

      const req = new NextRequest('http://localhost/api/appointments', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.Appointment.create).toHaveBeenCalled();
      expect(models.Invoice.create).toHaveBeenCalled();
      // Follow-up scheduling now takes (invoiceId, tenantSlug) — tenantSlug is required to
      // resolve the tenant's approved WABA template (WA follow-up migration).
      expect(scheduleFollowUp).toHaveBeenCalledWith('inv1', 'test-tenant');
    });
  });

  describe('GET /api/appointments/[id]', () => {
    it('should return an appointment', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({ _id: '1' })
      });
      (models.Appointment.findById as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/appointments/1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ONE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('PUT /api/appointments/[id]', () => {
    it('should update appointment and handle invoice creation if status becomes confirmed', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Settings.findOne as any).mockResolvedValue({ taxRate: 0 });
      (models.Appointment.findById as any).mockResolvedValue({
        _id: '1', services: [{ service: 's1', price: 100 }], discount: 0
      });
      
      const updatedAppt = {
        _id: '1', status: 'confirmed', services: [{ service: 's1', price: 100 }], customer: 'c1', staff: 's1'
      };
      (models.Appointment.findByIdAndUpdate as any).mockResolvedValue(updatedAppt);
      
      // Existing invoice check
      // PUT calls Invoice.findOne twice: once awaited directly (existing-invoice guard),
      // once chained via generateInvoiceNumber (.sort().lean()). A thenable that is also
      // chainable satisfies both, like a real Mongoose query.
      (models.Invoice.findOne as any).mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
        then: (resolve: any, reject: any) => Promise.resolve(null).then(resolve, reject),
      });
      (models.Invoice.countDocuments as any).mockResolvedValue(0);
      (models.Invoice.create as any).mockResolvedValue({ _id: 'inv1' });

      const req = new NextRequest('http://localhost/api/appointments/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ status: 'confirmed' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.Invoice.create).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/appointments/[id]', () => {
    it('should return 400 if appointment has paid invoices', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Invoice.find as any).mockResolvedValue([{ _id: 'inv1', status: 'paid' }]);

      const req = new NextRequest('http://localhost/api/appointments/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('sudah memiliki nota pembayaran lunas');
    });

    it('should void invoices and delete appointment if no paid invoices', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Invoice.find as any).mockResolvedValue([{ _id: 'inv1', status: 'pending' }]);
      (models.Deposit.deleteMany as any).mockResolvedValue({});
      (models.Invoice.updateMany as any).mockResolvedValue({});
      (models.Appointment.findByIdAndDelete as any).mockResolvedValue({});

      const req = new NextRequest('http://localhost/api/appointments/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      
      expect(res.status).toBe(200);
      expect(models.Deposit.deleteMany).toHaveBeenCalled();
      expect(models.Invoice.updateMany).toHaveBeenCalled();
      expect(models.Appointment.findByIdAndDelete).toHaveBeenCalledWith('1');
    });
  });
});
