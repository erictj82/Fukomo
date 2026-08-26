import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/payroll/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/payroll/[id]/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import mongoose from 'mongoose';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Payroll: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
    Staff: {
      find: vi.fn(),
      findById: vi.fn(),
    },
    Appointment: {
      find: vi.fn(),
    },
    Service: {
      find: vi.fn(),
    },
    Invoice: {
      find: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Payroll API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/payroll', () => {
    it('should return paginated payroll records', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Payroll.countDocuments as any).mockResolvedValue(1);

      const limitMock = vi.fn().mockResolvedValue([{ totalAmount: 500000 }]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.Payroll.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/payroll?month=5&year=2024', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });

    it('should search staff by name if search param is provided', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const staffId = new mongoose.Types.ObjectId();
      (models.Staff.find as any).mockReturnValue({
        select: vi.fn().mockResolvedValue([{ _id: staffId }])
      });

      (models.Payroll.countDocuments as any).mockResolvedValue(1);
      const limitMock = vi.fn().mockResolvedValue([{ totalAmount: 500000 }]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.Payroll.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/payroll?search=John', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Staff.find).toHaveBeenCalledWith({ name: expect.anything() });
      expect(models.Payroll.find).toHaveBeenCalledWith({ staff: { $in: [staffId] } });
    });
  });

  describe('POST /api/payroll', () => {
    it('should return 400 if required params missing', async () => {
      const req = new NextRequest('http://localhost/api/payroll', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ month: 5 }), // missing staffId, year
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should return 400 if payroll already exists', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Payroll.findOne as any).mockResolvedValue({ _id: 'pay1' });

      const req = new NextRequest('http://localhost/api/payroll', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ staffId: 's1', month: 5, year: 2024 }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
    });

    it('should generate payroll successfully', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Payroll.findOne as any).mockResolvedValue(null);
      (models.Staff.findById as any).mockResolvedValue({ _id: 's1', salary: 1000000 });
      
      const aptPopulateMock = vi.fn().mockResolvedValue([{
        _id: 'apt1',
        commission: 50000,
        tips: 10000,
        services: [{ price: 100000, name: 'Cut', service: { commissionValue: 50000 } }]
      }]);
      (models.Appointment.find as any).mockReturnValue({ populate: aptPopulateMock });
      
      (models.Invoice.find as any).mockResolvedValue([{
        _id: 'inv1',
        commission: 20000,
        tips: 5000,
        staff: 's1',
      }]);

      (models.Payroll.create as any).mockResolvedValue({ _id: 'pay1' });
      (models.Payroll.findById as any).mockReturnValue({ populate: vi.fn().mockResolvedValue({ _id: 'pay1' }) });

      const req = new NextRequest('http://localhost/api/payroll', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ staffId: 's1', month: 5, year: 2024 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Payroll.create).toHaveBeenCalled();
      
      // Verification of calculations can be added, but checking create is called is the main goal
    });
  });

  describe('GET /api/payroll/[id]', () => {
    it('should fetch a single payroll', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Payroll.findById as any).mockReturnValue({ populate: vi.fn().mockResolvedValue({ _id: 'pay1' }) });

      const req = new NextRequest('http://localhost/api/payroll/pay1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ONE(req as any, { params: Promise.resolve({ id: 'pay1' }) });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/payroll/[id]', () => {
    it('should update payroll simply if it is already paid', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockPayroll = { _id: 'pay1', status: 'paid', save: vi.fn() };
      (models.Payroll.findById as any).mockReturnValue({ populate: vi.fn().mockResolvedValue(mockPayroll) });

      const req = new NextRequest('http://localhost/api/payroll/pay1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ notes: 'Updated notes' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'pay1' }) });
      
      expect(res.status).toBe(200);
      expect(mockPayroll.notes).toBe('Updated notes');
      expect(mockPayroll.save).toHaveBeenCalled();
      expect(models.Appointment.find).not.toHaveBeenCalled(); // No recalculation
    });

    it('should recalculate if draft and status is changed', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockPayroll = {
        _id: 'pay1',
        status: 'draft',
        month: 5,
        year: 2024,
        staff: { _id: 's1', salary: 1000000 },
        save: vi.fn(),
      };
      (models.Payroll.findById as any).mockReturnValue({ populate: vi.fn().mockResolvedValue(mockPayroll) });

      const aptPopulateMock = vi.fn().mockResolvedValue([]);
      (models.Appointment.find as any).mockReturnValue({ populate: aptPopulateMock });
      (models.Invoice.find as any).mockResolvedValue([]);

      const req = new NextRequest('http://localhost/api/payroll/pay1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ status: 'approved' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'pay1' }) });
      
      expect(res.status).toBe(200);
      expect(mockPayroll.status).toBe('approved');
      expect(mockPayroll.save).toHaveBeenCalled();
      expect(models.Appointment.find).toHaveBeenCalled(); // Recalculation happened
    });
  });

  describe('DELETE /api/payroll/[id]', () => {
    it('should delete a payroll', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Payroll.findById as any).mockResolvedValue({ _id: 'pay1' });
      (models.Payroll.findByIdAndDelete as any).mockResolvedValue({});

      const req = new NextRequest('http://localhost/api/payroll/pay1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'pay1' }) });
      
      expect(res.status).toBe(200);
      expect(models.Payroll.findByIdAndDelete).toHaveBeenCalledWith('pay1');
    });
  });
});
