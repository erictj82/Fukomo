import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/customer-packages/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    CustomerPackage: {
      find: vi.fn(),
    },
    PackageUsageLedger: {
      find: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Customer Packages API - Expiration Filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if customerId is not provided', async () => {
    const req = new NextRequest('http://localhost/api/customer-packages', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    const res = await GET(req, {});
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Valid customerId is required');
  });

  it('should filter expired packages using $or query on expiresAt', async () => {
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');

    const mockPackages = [
      { _id: 'pkg1', status: 'active', expiresAt: new Date('2099-12-31') }
    ];

    // Chain: find().populate().sort()
    const sortMock = vi.fn().mockResolvedValue(mockPackages);
    const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
    (models.CustomerPackage.find as any).mockReturnValue({ populate: populateMock });

    const req = new NextRequest('http://localhost/api/customer-packages?customerId=64a1b2c3d4e5f6a7b8c9d0e1', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    const res = await GET(req, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify the query contains $or for expiresAt filtering
    const findCallArg = (models.CustomerPackage.find as any).mock.calls[0][0];
    expect(findCallArg.$or).toBeDefined();
    expect(findCallArg.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expiresAt: { $exists: false } }),
        expect.objectContaining({ expiresAt: null }),
        expect.objectContaining({ expiresAt: expect.objectContaining({ $gt: expect.any(Date) }) }),
      ])
    );
  });

  it('should include ledger data if includeLedger=true', async () => {
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');

    const mockPackages = [
      { _id: 'pkg1', status: 'active' }
    ];
    const mockLedger = [
      { _id: 'led1', customerPackage: 'pkg1', service: { name: 'Haircut' } }
    ];

    const sortMock = vi.fn().mockResolvedValue(mockPackages);
    const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
    (models.CustomerPackage.find as any).mockReturnValue({ populate: populateMock });

    // Ledger chain: find().populate().populate().sort().limit()
    const ledgerLimitMock = vi.fn().mockResolvedValue(mockLedger);
    const ledgerSortMock = vi.fn().mockReturnValue({ limit: ledgerLimitMock });
    const ledgerPopulate2Mock = vi.fn().mockReturnValue({ sort: ledgerSortMock });
    const ledgerPopulate1Mock = vi.fn().mockReturnValue({ populate: ledgerPopulate2Mock });
    (models.PackageUsageLedger.find as any).mockReturnValue({ populate: ledgerPopulate1Mock });

    const req = new NextRequest('http://localhost/api/customer-packages?customerId=64a1b2c3d4e5f6a7b8c9d0e1&includeLedger=true', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    const res = await GET(req, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.ledger).toBeDefined();
    expect(data.ledger.length).toBe(1);
  });
});
