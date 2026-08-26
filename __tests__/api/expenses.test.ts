import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/expenses/route';
import { PUT, DELETE } from '@/app/api/expenses/[id]/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { auth } from '@/auth';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Expense: {
      find: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
    Settings: {
      findOne: vi.fn(),
    },
    CashBalance: {
      findOneAndUpdate: vi.fn(),
    },
    CashLog: {
      create: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}));

describe('Expenses API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/expenses', () => {
    it('should return paginated expenses', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Settings.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ timezone: 'UTC' })
      });
      (models.Expense.countDocuments as any).mockResolvedValue(1);

      const limitMock = vi.fn().mockResolvedValue([{ title: 'Listrik' }]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.Expense.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/expenses?page=1&limit=10', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req as any, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/expenses', () => {
    it('should return 400 if amount is invalid', async () => {
      const req = new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: -100 }),
      });

      const res = await POST(req as any, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Nominal pengeluaran harus lebih dari 0');
    });

    it('should create expense and deduct from CashDrawer if method is Cash', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Expense.create as any).mockResolvedValue({ _id: 'e1', title: 'Test', amount: 500, paymentMethod: 'cash' });
      (models.CashBalance.findOneAndUpdate as any).mockResolvedValue({ kasirBalance: 500 });
      (models.CashLog.create as any).mockResolvedValue({});

      const req = new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ title: 'Test', amount: 500, paymentMethod: 'cash' }),
      });

      const res = await POST(req as any, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Expense.create).toHaveBeenCalled();
      expect(models.CashBalance.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        { $inc: { kasirBalance: -500 }, $set: expect.any(Object) },
        { new: true, upsert: true }
      );
      expect(models.CashLog.create).toHaveBeenCalled();
    });

    it('should create expense without CashDrawer deduct if method is not cash', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Expense.create as any).mockResolvedValue({ _id: 'e2', title: 'Test', amount: 500, paymentMethod: 'transfer' });

      const req = new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ title: 'Test', amount: 500, paymentMethod: 'transfer' }),
      });

      const res = await POST(req as any, {});
      
      expect(res.status).toBe(200);
      expect(models.CashBalance.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/expenses/[id]', () => {
    it('should update an expense', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Expense.findByIdAndUpdate as any).mockResolvedValue({ _id: 'e1', title: 'Updated' });

      const req = new NextRequest('http://localhost/api/expenses/e1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ title: 'Updated' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'e1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Expense.findByIdAndUpdate).toHaveBeenCalledWith('e1', { title: 'Updated' }, { new: true });
    });
  });

  describe('DELETE /api/expenses/[id]', () => {
    it('should delete an expense', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Expense.findByIdAndDelete as any).mockResolvedValue({});

      const req = new NextRequest('http://localhost/api/expenses/e1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'e1' }) });
      expect(res.status).toBe(200);
      expect(models.Expense.findByIdAndDelete).toHaveBeenCalledWith('e1');
    });
  });
});
