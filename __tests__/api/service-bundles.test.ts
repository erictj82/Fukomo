import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_ALL, POST } from '@/app/api/service-bundles/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/service-bundles/[id]/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    ServiceBundle: {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
  }),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

describe('Service Bundles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/service-bundles', () => {
    it('should return list of active service bundles populated with services', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockBundles = [
        { _id: '1', name: 'Wedding Package', isActive: true, services: [{ service: { name: 'Makeup' } }] }
      ];

      const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockBundles) });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.ServiceBundle.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-bundles', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ALL(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data[0].name).toBe('Wedding Package');
      expect(models.ServiceBundle.find).toHaveBeenCalledWith({ isActive: true });
      // Route projection now also selects selling-commission fields on the populated service.
      expect(populateMock).toHaveBeenCalledWith('services.service', 'name price commissionType commissionValue sellingCommissionType sellingCommissionValue duration');
    });
  });

  describe('POST /api/service-bundles', () => {
    it('should return 400 if name is missing', async () => {
      const req = new NextRequest('http://localhost/api/service-bundles', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ price: 100, services: [{ service: 's1' }] }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Nama bundle wajib diisi');
    });

    it('should return 400 if price is negative', async () => {
      const req = new NextRequest('http://localhost/api/service-bundles', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Bundle', price: -5, services: [{ service: 's1' }] }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
    });

    it('should return 400 if services is empty', async () => {
      const req = new NextRequest('http://localhost/api/service-bundles', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Bundle', price: 100, services: [] }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
    });

    it('should create a bundle successfully', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const payload = {
        name: 'Promo Bundle',
        price: 500,
        services: [{ service: 's1', quantity: 1 }]
      };

      (models.ServiceBundle.create as any).mockResolvedValue({ _id: '1', ...payload });

      const req = new NextRequest('http://localhost/api/service-bundles', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      // Route now persists optional media + selling-commission fields with defaults.
      // With this payload (name/price/services only) the optional strings fall through to
      // `undefined` and selling-commission defaults to fixed/0.
      expect(models.ServiceBundle.create).toHaveBeenCalledWith({
        name: 'Promo Bundle',
        description: undefined,
        price: 500,
        sellingCommissionType: 'fixed',
        sellingCommissionValue: 0,
        image: undefined,
        icon: undefined,
        services: payload.services,
      });
    });
  });

  describe('GET /api/service-bundles/[id]', () => {
    it('should return a bundle by id', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock = vi.fn().mockResolvedValue({ _id: '1', name: 'Bundle 1' });
      (models.ServiceBundle.findById as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-bundles/1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ONE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.name).toBe('Bundle 1');
      expect(models.ServiceBundle.findById).toHaveBeenCalledWith('1');
    });

    it('should return 404 if bundle not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock = vi.fn().mockResolvedValue(null);
      (models.ServiceBundle.findById as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-bundles/99', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ONE(req, { params: Promise.resolve({ id: '99' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/service-bundles/[id]', () => {
    it('should validate inputs during update', async () => {
      const req = new NextRequest('http://localhost/api/service-bundles/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ price: -10 }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });

    it('should update a bundle successfully', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock = vi.fn().mockResolvedValue({ _id: '1', name: 'Updated Bundle' });
      (models.ServiceBundle.findByIdAndUpdate as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-bundles/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Updated Bundle', price: 600 }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.name).toBe('Updated Bundle');
      
      const updateCall = (models.ServiceBundle.findByIdAndUpdate as any).mock.calls[0];
      expect(updateCall[0]).toBe('1');
      expect(updateCall[1]).toEqual({ name: 'Updated Bundle', price: 600 });
    });
  });

  describe('DELETE /api/service-bundles/[id]', () => {
    it('should soft delete a bundle', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.ServiceBundle.findByIdAndUpdate as any).mockResolvedValue({ _id: '1', isActive: false });

      const req = new NextRequest('http://localhost/api/service-bundles/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.ServiceBundle.findByIdAndUpdate).toHaveBeenCalledWith('1', { isActive: false }, { new: true });
    });
  });
});
