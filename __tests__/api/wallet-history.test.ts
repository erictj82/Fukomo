import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/customers/[id]/wallet/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    WalletTransaction: {
      find: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Wallet History API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return wallet transactions for a customer', async () => {
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');

    const mockTransactions = [
      { _id: 'tx1', type: 'topup', amount: 100000 },
      { _id: 'tx2', type: 'payment', amount: 50000 }
    ];

    // Chain: find().populate('invoice').populate('performedBy').sort().limit()
    const limitMock = vi.fn().mockResolvedValue(mockTransactions);
    const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
    const populate2Mock = vi.fn().mockReturnValue({ sort: sortMock });
    const populate1Mock = vi.fn().mockReturnValue({ populate: populate2Mock });
    (models.WalletTransaction.find as any).mockReturnValue({ populate: populate1Mock });

    const req = new NextRequest('http://localhost/api/customers/cust1/wallet', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    // Next.js 16 uses Promise-based params
    const res = await GET(req, { params: Promise.resolve({ id: 'cust1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.length).toBe(2);
    expect(data.data[0].type).toBe('topup');
    expect(data.data[1].type).toBe('payment');
    expect(models.WalletTransaction.find).toHaveBeenCalledWith({ customer: 'cust1' });
  });

  it('should return 500 on database error', async () => {
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');

    // Simulate a DB error
    (models.WalletTransaction.find as any).mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const req = new NextRequest('http://localhost/api/customers/cust1/wallet', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    const res = await GET(req, { params: Promise.resolve({ id: 'cust1' }) });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
