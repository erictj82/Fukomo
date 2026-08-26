import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/service-categories/route';
import { PUT, DELETE } from '@/app/api/service-categories/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    ServiceCategory: {
      find: vi.fn(),
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
    // Route sudah migrasi ke checkPermissionWithSession (B14). Test ini uji happy-path
    // (checkPermission→null = authorized), jadi kita lewatin enforcement tapi tetap balikin
    // session dari auth mock supaya session.user.id yang dipakai route tetap konsisten.
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

describe('Service Categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/service-categories', () => {
    it('should return list of active service categories sorted by name', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const mockCategories = [
        { _id: '1', name: 'Haircut', status: 'active', slug: 'haircut' },
        { _id: '2', name: 'Coloring', status: 'active', slug: 'coloring' }
      ];
      
      const sortMock = vi.fn().mockResolvedValue(mockCategories);
      (models.ServiceCategory.find as any).mockReturnValue({
        sort: sortMock
      });

      const req = new NextRequest('http://localhost/api/service-categories', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(2);
      expect(data.data[0].name).toBe('Haircut');
      expect(models.ServiceCategory.find).toHaveBeenCalledWith({ status: 'active' });
      expect(sortMock).toHaveBeenCalledWith({ name: 1 });
    });

    it('should return 500 if database query fails', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.ServiceCategory.find as any).mockImplementation(() => {
        throw new Error('Database Error');
      });

      const req = new NextRequest('http://localhost/api/service-categories', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch categories');
    });
  });

  describe('POST /api/service-categories', () => {
    it('should create a new service category', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const newCategory = { name: 'Facial', slug: 'facial', status: 'active' };
      (models.ServiceCategory.create as any).mockResolvedValue({ _id: '3', ...newCategory });

      const req = new NextRequest('http://localhost/api/service-categories', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify(newCategory),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200); // the route returns 200 currently
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Facial');
      expect(models.ServiceCategory.create).toHaveBeenCalledWith(newCategory);
    });

    it('should return 500 if creation fails', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.ServiceCategory.create as any).mockRejectedValue(new Error('DB Error'));

      const req = new NextRequest('http://localhost/api/service-categories', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Facial' }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('PUT /api/service-categories/[id]', () => {
    it('should update an existing service category', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const updatedCategory = { _id: '1', name: 'Updated Haircut' };
      (models.ServiceCategory.findByIdAndUpdate as any).mockResolvedValue(updatedCategory);

      const req = new NextRequest('http://localhost/api/service-categories/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Updated Haircut' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Haircut');
      expect(models.ServiceCategory.findByIdAndUpdate).toHaveBeenCalledWith('1', { name: 'Updated Haircut' }, { new: true });
    });

    it('should return 404 if category to update is not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.ServiceCategory.findByIdAndUpdate as any).mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/service-categories/99', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Updated Haircut' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '99' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/service-categories/[id]', () => {
    it('should soft delete a category (set status to inactive)', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const softDeletedCategory = { _id: '1', name: 'Haircut', status: 'inactive' };
      (models.ServiceCategory.findByIdAndUpdate as any).mockResolvedValue(softDeletedCategory);

      const req = new NextRequest('http://localhost/api/service-categories/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('inactive');
      expect(models.ServiceCategory.findByIdAndUpdate).toHaveBeenCalledWith('1', { status: 'inactive' }, { new: true });
    });

    it('should return 404 if category to delete is not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.ServiceCategory.findByIdAndUpdate as any).mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/service-categories/99', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '99' }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
