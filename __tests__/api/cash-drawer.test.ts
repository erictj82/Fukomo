import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_STATUS } from '@/app/api/cash-drawer/route';
import { POST as TRANSFER } from '@/app/api/cash-drawer/transfer/route';
import { GET as GET_LOGS } from '@/app/api/cash-drawer/logs/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { auth } from '@/auth';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    CashBalance: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
    CashSession: {
      findOne: vi.fn(),
    },
    CashLog: {
      countDocuments: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
    },
    User: {
      find: vi.fn(),
    },
    // transfer route reads owner-authorization passwords from Settings before the User fallback
    Settings: {
      findOne: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    // transfer route migrated to checkPermissionWithSession (B14) — 1 auth() call, returns { error, session }
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}));

vi.mock('@/lib/logger', () => ({
  logActivity: vi.fn(),
}));

describe('Cash Drawer APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/cash-drawer', () => {
    it('should return balance and active session', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.CashBalance.findOne as any).mockResolvedValue({ kasirBalance: 1000 });
      const sessionPopulateMock = vi.fn().mockResolvedValue({ status: 'open' });
      (models.CashSession.findOne as any).mockReturnValue({ populate: sessionPopulateMock });

      const req = new NextRequest('http://localhost/api/cash-drawer', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_STATUS(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.balance.kasirBalance).toBe(1000);
      expect(data.data.activeSession.status).toBe('open');
    });

    it('should create default balance if not exists', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.CashBalance.findOne as any).mockResolvedValue(null);
      (models.CashBalance.create as any).mockResolvedValue({ kasirBalance: 0, brankasBalance: 0, bankBalance: 0 });
      (models.CashSession.findOne as any).mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });

      const req = new NextRequest('http://localhost/api/cash-drawer', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_STATUS(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.CashBalance.create).toHaveBeenCalled();
    });
  });

  describe('GET /api/cash-drawer/logs', () => {
    it('should return paginated cash logs', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.CashLog.countDocuments as any).mockResolvedValue(1);
      
      const leanMock = vi.fn().mockResolvedValue([{ type: 'transfer' }]);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.CashLog.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/cash-drawer/logs?type=transfer', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_LOGS(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(models.CashLog.find).toHaveBeenCalledWith({ type: 'transfer' });
    });
  });

  describe('POST /api/cash-drawer/transfer', () => {
    it('should return 400 if params are invalid', async () => {
      const req = new NextRequest('http://localhost/api/cash-drawer/transfer', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: -500 }), // missing source, dest, invalid amount
      });

      const res = await TRANSFER(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Invalid transfer parameters');
    });

    it('should return 400 if kasir balance is insufficient', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.CashBalance.findOne as any).mockResolvedValue({ kasirBalance: 100 });

      const req = new NextRequest('http://localhost/api/cash-drawer/transfer', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ source: 'kasir', destination: 'brankas', amount: 500 }),
      });

      const res = await TRANSFER(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Saldo kasir tidak mencukupi');
    });

    it('should transfer from kasir to brankas successfully', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockBalance = { kasirBalance: 1000, brankasBalance: 500, bankBalance: 0, save: vi.fn() };
      (models.CashBalance.findOne as any).mockResolvedValue(mockBalance);
      (models.CashLog.create as any).mockResolvedValue({ _id: 'log1' });

      const req = new NextRequest('http://localhost/api/cash-drawer/transfer', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ source: 'kasir', destination: 'brankas', amount: 500 }),
      });

      const res = await TRANSFER(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockBalance.kasirBalance).toBe(500); // 1000 - 500
      expect(mockBalance.brankasBalance).toBe(1000); // 500 + 500
      expect(mockBalance.save).toHaveBeenCalled();
      expect(models.CashLog.create).toHaveBeenCalled();
    });

    it('should return 401 if ownerPassword missing when transferring from brankas', async () => {
      const req = new NextRequest('http://localhost/api/cash-drawer/transfer', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ source: 'brankas', destination: 'bank', amount: 500 }), // missing ownerPassword
      });

      const res = await TRANSFER(req, {});
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toContain('Password Otoritas Owner diperlukan');
    });

    it('should return 403 if ownerPassword is wrong', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockAdmin = { role: { name: 'Owner' }, comparePassword: vi.fn().mockResolvedValue(false) };
      // route chain: User.find({}).select('+password').populate('role')
      (models.User.find as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue([mockAdmin])
        })
      });

      const req = new NextRequest('http://localhost/api/cash-drawer/transfer', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ source: 'brankas', destination: 'bank', amount: 500, ownerPassword: 'wrong' }),
      });

      const res = await TRANSFER(req, {});
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Password Otoritas salah');
    });
  });
});
