import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_ALL, POST } from '@/app/api/service-packages/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/service-packages/[id]/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    ServicePackage: {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
    Service: {
      find: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null), // null means authorized
}));

describe('Service Packages API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/service-packages', () => {
    it('should return 403 if permission denied', async () => {
      (checkPermission as any).mockResolvedValue(new Response('Forbidden', { status: 403 }));

      const req = new NextRequest('http://localhost/api/service-packages', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ALL(req, {});
      expect(res.status).toBe(403);
    });

    it('should return packages with active filter and populate', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockPackages = [{ _id: '1', name: 'Pack A' }];
      const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockPackages) });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.ServicePackage.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-packages?active=true', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ALL(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.length).toBe(1);
      expect(models.ServicePackage.find).toHaveBeenCalledWith({ isActive: true });
      expect(populateMock).toHaveBeenCalledWith('items.service', 'name price');
    });

    it('should search by name or code', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.ServicePackage.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/service-packages?search=pack', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      await GET_ALL(req, {});

      expect(models.ServicePackage.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'pack', $options: 'i' } },
          { code: { $regex: 'pack', $options: 'i' } },
        ]
      });
    });
  });

  describe('POST /api/service-packages', () => {
    it('should validate package items length', async () => {
      const req = new NextRequest('http://localhost/api/service-packages', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'A', code: 'A', price: 10, items: [] }),
      });

      const res = await POST(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('Package must contain at least one service item');
    });

    it('should validate item structure (missing service)', async () => {
      const req = new NextRequest('http://localhost/api/service-packages', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'A', code: 'A', price: 10, items: [{ quota: 1 }] }),
      });

      const res = await POST(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('Each item must include a service');
    });

    it('should validate duplicate services', async () => {
      const req = new NextRequest('http://localhost/api/service-packages', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          name: 'A', code: 'A', price: 10,
          items: [{ service: 's1', quota: 1 }, { service: 's1', quota: 2 }]
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('Duplicate service in package items is not allowed');
    });

    it('should sanitize code and create package', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const selectMock = vi.fn().mockResolvedValue([{ _id: 's1', name: 'Service 1' }]);
      (models.Service.find as any).mockReturnValue({ select: selectMock });
      
      (models.ServicePackage.create as any).mockResolvedValue({ _id: '1', name: 'A' });

      const req = new NextRequest('http://localhost/api/service-packages', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          name: 'A', code: ' my code ', price: 100,
          items: [{ service: 's1', quota: 5 }]
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(models.ServicePackage.create).toHaveBeenCalled();
      const createArgs = (models.ServicePackage.create as any).mock.calls[0][0];
      expect(createArgs.code).toBe('MY-CODE');
    });

    it('should handle duplicate code error (11000)', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const selectMock = vi.fn().mockResolvedValue([{ _id: 's1', name: 'Service 1' }]);
      (models.Service.find as any).mockReturnValue({ select: selectMock });
      
      (models.ServicePackage.create as any).mockRejectedValue({ code: 11000 });

      const req = new NextRequest('http://localhost/api/service-packages', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          name: 'A', code: 'A', price: 100,
          items: [{ service: 's1', quota: 5 }]
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Package code already exists');
    });
  });

  describe('PUT /api/service-packages/[id]', () => {
    it('should update package fields', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.ServicePackage.findByIdAndUpdate as any).mockResolvedValue({ _id: '1', name: 'Updated' });

      const req = new NextRequest('http://localhost/api/service-packages/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Updated', code: ' new code ' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      const updateArgs = (models.ServicePackage.findByIdAndUpdate as any).mock.calls[0][1];
      expect(updateArgs.name).toBe('Updated');
      expect(updateArgs.code).toBe('NEW-CODE');
    });

    it('should return 404 if package not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.ServicePackage.findByIdAndUpdate as any).mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/service-packages/99', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'A' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '99' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/service-packages/[id]', () => {
    it('should soft delete package', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.ServicePackage.findByIdAndUpdate as any).mockResolvedValue({ _id: '1', isActive: false });

      const req = new NextRequest('http://localhost/api/service-packages/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      expect(models.ServicePackage.findByIdAndUpdate).toHaveBeenCalledWith('1', { isActive: false }, { new: true });
    });
  });
});
