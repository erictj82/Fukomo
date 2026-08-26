import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

describe('Phase 1 Cross-Permission Fixes - Dedicated List Endpoints', () => {
  let mockModels: any;
  let mockCheckPermission: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getTenantModels } = await import('@/lib/tenantDb');
    const { checkPermission } = await import('@/lib/rbac');

    mockCheckPermission = checkPermission as any;

    // Chain terminal object is BOTH awaitable (routes that await .sort()
    // directly) AND exposes .lean() (routes that call .sort().lean()). It also
    // supports .select() and .populate() in any order to match each route.
    const chain = (arr: any): any => ({
      select: () => chain(arr),
      sort: () => chain(arr),
      populate: () => chain(arr),
      lean: () => Promise.resolve(arr),
      then: (resolve: any, reject: any) => Promise.resolve(arr).then(resolve, reject),
    });

    // Setup mock models
    mockModels = {
      Service: {
        find: vi.fn().mockReturnValue(chain([
          { _id: '1', name: 'Haircut', price: 50000, duration: 30 },
          { _id: '2', name: 'Massage', price: 100000, duration: 60 },
        ])),
      },
      Product: {
        find: vi.fn().mockReturnValue(chain([
          { _id: '1', name: 'Shampoo', price: 25000, stock: 50 },
          { _id: '2', name: 'Conditioner', price: 30000, stock: 40 },
        ])),
      },
      Customer: {
        find: vi.fn().mockReturnValue(chain([
          { _id: '1', name: 'John Doe', phone: '081234567890' },
          { _id: '2', name: 'Jane Smith', phone: '081234567891' },
        ])),
      },
      CustomerPackage: {
        find: vi.fn().mockReturnValue(chain([])),
      },
      Staff: {
        find: vi.fn().mockReturnValue(chain([
          { _id: '1', name: 'Staff A', position: 'Stylist' },
          { _id: '2', name: 'Staff B', position: 'Therapist' },
        ])),
      },
      Supplier: {
        find: vi.fn().mockReturnValue(chain([
          { _id: '1', name: 'Supplier A', phone: '081234567892' },
          { _id: '2', name: 'Supplier B', phone: '081234567893' },
        ])),
      },
    };

    (getTenantModels as any).mockResolvedValue(mockModels);
  });

  describe('POS Module - 3 Dependencies', () => {
    describe('GET /api/services/pos-list', () => {
      it('should return services when user has pos.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null); // No error = has permission

        const { GET } = await import('@/app/api/services/pos-list/route');
        const req = new NextRequest('http://localhost/api/services/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(data.data[0]).toHaveProperty('price');
        expect(data.data[0]).toHaveProperty('duration');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'pos', 'view');
      });

      it('should return 403 when user lacks pos.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/services/pos-list/route');
        const req = new NextRequest('http://localhost/api/services/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });

      it('should only return active services', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/services/pos-list/route');
        const req = new NextRequest('http://localhost/api/services/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        await GET(req);

        // Service model uses a `status` enum ('active'|'inactive'), not an isActive boolean —
        // matches app/api/services/route.ts and the Service schema.
        expect(mockModels.Service.find).toHaveBeenCalledWith({ status: 'active' });
      });
    });

    describe('GET /api/products/pos-list', () => {
      it('should return products when user has pos.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/products/pos-list/route');
        const req = new NextRequest('http://localhost/api/products/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(data.data[0]).toHaveProperty('price');
        expect(data.data[0]).toHaveProperty('stock');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'pos', 'view');
      });

      it('should return 403 when user lacks pos.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/products/pos-list/route');
        const req = new NextRequest('http://localhost/api/products/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/customers/pos-list', () => {
      it('should return customers when user has pos.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/customers/pos-list/route');
        const req = new NextRequest('http://localhost/api/customers/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'pos', 'view');
      });

      it('should return 403 when user lacks pos.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/customers/pos-list/route');
        const req = new NextRequest('http://localhost/api/customers/pos-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Payroll Module - 1 Dependency', () => {
    describe('GET /api/staff/payroll-list', () => {
      it('should return staff when user has payroll.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/staff/payroll-list/route');
        const req = new NextRequest('http://localhost/api/staff/payroll-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'payroll', 'view');
      });

      it('should return 403 when user lacks payroll.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/staff/payroll-list/route');
        const req = new NextRequest('http://localhost/api/staff/payroll-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Purchases Module - 2 Dependencies', () => {
    describe('GET /api/suppliers/purchase-list', () => {
      it('should return suppliers when user has purchases.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/suppliers/purchase-list/route');
        const req = new NextRequest('http://localhost/api/suppliers/purchase-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'purchases', 'view');
      });

      it('should return 403 when user lacks purchases.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/suppliers/purchase-list/route');
        const req = new NextRequest('http://localhost/api/suppliers/purchase-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/products/purchase-list', () => {
      it('should return products when user has purchases.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/products/purchase-list/route');
        const req = new NextRequest('http://localhost/api/products/purchase-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'purchases', 'view');
      });

      it('should return 403 when user lacks purchases.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/products/purchase-list/route');
        const req = new NextRequest('http://localhost/api/products/purchase-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Usage Logs Module - 2 Dependencies', () => {
    describe('GET /api/products/usage-list', () => {
      it('should return products when user has usageLogs.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/products/usage-list/route');
        const req = new NextRequest('http://localhost/api/products/usage-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'usageLogs', 'view');
      });

      it('should return 403 when user lacks usageLogs.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/products/usage-list/route');
        const req = new NextRequest('http://localhost/api/products/usage-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/staff/usage-list', () => {
      it('should return staff when user has usageLogs.view permission', async () => {
        mockCheckPermission.mockResolvedValue(null);

        const { GET } = await import('@/app/api/staff/usage-list/route');
        const req = new NextRequest('http://localhost/api/staff/usage-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(2);
        expect(data.data[0]).toHaveProperty('_id');
        expect(data.data[0]).toHaveProperty('name');
        expect(mockCheckPermission).toHaveBeenCalledWith(req, 'usageLogs', 'view');
      });

      it('should return 403 when user lacks usageLogs.view permission', async () => {
        const forbiddenResponse = new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403 }
        );
        mockCheckPermission.mockResolvedValue(forbiddenResponse);

        const { GET } = await import('@/app/api/staff/usage-list/route');
        const req = new NextRequest('http://localhost/api/staff/usage-list', {
          headers: { 'x-store-slug': 'test-tenant' },
        });

        const res = await GET(req);
        expect(res.status).toBe(403);
      });
    });
  });
});
