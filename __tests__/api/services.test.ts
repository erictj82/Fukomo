import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/services/route';
import { PUT, DELETE } from '@/app/api/services/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Service: {
      find: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
    ServiceCategory: {},
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

describe('Services API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/services', () => {
    it('should return list of services with pagination and populate category', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const mockServices = [
        { _id: '1', name: 'Haircut', category: { _id: 'cat1', name: 'Hair' } }
      ];
      
      const limitMock = vi.fn().mockResolvedValue(mockServices);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      
      (models.Service.find as any).mockReturnValue({
        populate: populateMock
      });
      (models.Service.countDocuments as any).mockResolvedValue(1);

      const req = new NextRequest('http://localhost/api/services?page=1&limit=10', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.pagination.total).toBe(1);
      expect(models.Service.find).toHaveBeenCalledWith({ status: 'active' });
      expect(populateMock).toHaveBeenCalledWith('category', 'name');
    });

    it('should apply category and search filters', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      const limitMock = vi.fn().mockResolvedValue([]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      
      (models.Service.find as any).mockReturnValue({ populate: populateMock });
      (models.Service.countDocuments as any).mockResolvedValue(0);

      const req = new NextRequest('http://localhost/api/services?category=cat1&search=hair', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      await GET(req, {});

      expect(models.Service.find).toHaveBeenCalledWith({
        status: 'active',
        category: 'cat1',
        name: { $regex: 'hair', $options: 'i' }
      });
    });
  });

  describe('POST /api/services', () => {
    it('should create a service and normalize waFollowUp legacy days correctly', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.Service.create as any).mockImplementation(async (body: any) => ({ _id: '1', ...body }));

      const req = new NextRequest('http://localhost/api/services', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          name: 'New Service',
          waFollowUp: {
            firstDelayValue: 1440,
            firstDelayUnit: 'minute',
            secondDelayValue: 48,
            secondDelayUnit: 'hour'
          }
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.Service.create).toHaveBeenCalled();
      
      const createArg = (models.Service.create as any).mock.calls[0][0];
      expect(createArg.waFollowUp.firstDays).toBe(1); // 1440 mins = 1 day
      expect(createArg.waFollowUp.secondDays).toBe(2); // 48 hours = 2 days
    });
  });

  describe('PUT /api/services/[id]', () => {
    it('should update a service and normalize waFollowUp', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.Service.findByIdAndUpdate as any).mockImplementation(async (id: any, body: any) => ({ _id: id, ...body }));

      const req = new NextRequest('http://localhost/api/services/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          name: 'Updated Service',
          waFollowUp: {
            firstDelayValue: 2,
            firstDelayUnit: 'day'
          }
        }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      const updateArg = (models.Service.findByIdAndUpdate as any).mock.calls[0][1];
      expect(updateArg.waFollowUp.firstDays).toBe(2);
    });

    it('should return 404 if service not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.Service.findByIdAndUpdate as any).mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/services/99', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'Updated Service' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '99' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/services/[id]', () => {
    it('should soft delete a service', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      
      (models.Service.findByIdAndUpdate as any).mockResolvedValue({ _id: '1', status: 'inactive' });

      const req = new NextRequest('http://localhost/api/services/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Service.findByIdAndUpdate).toHaveBeenCalledWith('1', { status: 'inactive' }, { new: true });
    });
  });
});
