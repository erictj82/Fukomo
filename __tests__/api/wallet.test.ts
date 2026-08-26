import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/wallet/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { auth } from '@/auth';

// Setup Mocks
const mockCashBalanceUpdate = vi.fn();
const mockCashLogCreate = vi.fn();

vi.mock('@/models/CashBalance', () => ({
  default: {
    findOneAndUpdate: (...args: any[]) => mockCashBalanceUpdate(...args),
  }
}));

vi.mock('@/models/CashLog', () => ({
  default: {
    create: (...args: any[]) => mockCashLogCreate(...args),
  }
}));

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Customer: {
      findById: vi.fn(),
      find: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    WalletTransaction: {
      find: vi.fn(),
      create: vi.fn(),
    },
    Settings: {
      findOne: vi.fn(),
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

describe('Wallet API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/wallet', () => {
    it('should return transactions for a specific customer', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'c1', walletBalance: 150000 }) })
      });

      const txLeanMock = vi.fn().mockResolvedValue([{ amount: 50000 }]);
      const limitMock = vi.fn().mockReturnValue({ lean: txLeanMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      const populateMock2 = vi.fn().mockReturnValue({ sort: sortMock });
      const populateMock1 = vi.fn().mockReturnValue({ populate: populateMock2 });
      
      (models.WalletTransaction.find as any).mockReturnValue({ populate: populateMock1 });

      const req = new NextRequest('http://localhost/api/wallet?customerId=c1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.balance).toBe(150000);
      expect(data.data.transactions.length).toBe(1);
    });

    it('should return all customers with balance > 0 if no customerId', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const leanMock = vi.fn().mockResolvedValue([{ _id: 'c1', walletBalance: 10000 }]);
      const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
      const selectMock = vi.fn().mockReturnValue({ sort: sortMock });
      
      (models.Customer.find as any).mockReturnValue({ select: selectMock });

      const req = new NextRequest('http://localhost/api/wallet', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/wallet', () => {
    it('should return 400 if amount is invalid', async () => {
      const req = new NextRequest('http://localhost/api/wallet', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId: 'c1', type: 'topup', amount: -100 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should top-up wallet and add bonus if tier met', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Settings.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          walletBonusTiers: [
            { minAmount: 100000, bonusPercent: 10 },
            { minAmount: 50000, bonusPercent: 5 },
          ]
        })
      });

      (models.Customer.findByIdAndUpdate as any).mockResolvedValue({ _id: 'c1', walletBalance: 110000 });
      (models.WalletTransaction.create as any).mockResolvedValue({ _id: 'tx1' });
      mockCashBalanceUpdate.mockResolvedValue({ kasirBalance: 100000, brankasBalance: 0, bankBalance: 0 });

      const req = new NextRequest('http://localhost/api/wallet', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId: 'c1', type: 'topup', amount: 100000, paymentMethod: 'Cash' }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.bonusPercent).toBe(10);
      expect(data.data.bonusAmount).toBe(10000); // 10% of 100000
      expect(data.data.totalCredited).toBe(110000);
      
      expect(models.Customer.findByIdAndUpdate).toHaveBeenCalledWith('c1', { $inc: { walletBalance: 110000 } }, { new: true });
      expect(mockCashBalanceUpdate).toHaveBeenCalled(); // Since paymentMethod is Cash
      expect(mockCashLogCreate).toHaveBeenCalled();
    });

    it('should return 400 if payment type and balance insufficient', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findOneAndUpdate as any).mockResolvedValue(null); // Simulated failure

      const req = new NextRequest('http://localhost/api/wallet', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId: 'c1', type: 'payment', amount: 50000 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Saldo tidak cukup');
    });

    it('should successfully deduct wallet for payment', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findOneAndUpdate as any).mockResolvedValue({ _id: 'c1', walletBalance: 50000 });
      (models.WalletTransaction.create as any).mockResolvedValue({ _id: 'tx2' });

      const req = new NextRequest('http://localhost/api/wallet', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId: 'c1', type: 'payment', amount: 30000 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Customer.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'c1', walletBalance: { $gte: 30000 } },
        { $inc: { walletBalance: -30000 } },
        { new: true }
      );
    });

    it('should successfully refund to wallet', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findByIdAndUpdate as any).mockResolvedValue({ _id: 'c1', walletBalance: 80000 });
      (models.WalletTransaction.create as any).mockResolvedValue({ _id: 'tx3' });

      const req = new NextRequest('http://localhost/api/wallet', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId: 'c1', type: 'refund', amount: 20000 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Customer.findByIdAndUpdate).toHaveBeenCalledWith('c1', { $inc: { walletBalance: 20000 } }, { new: true });
    });
  });
});
