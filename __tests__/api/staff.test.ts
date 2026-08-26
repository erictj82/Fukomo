import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/staff/route';
import { PUT, DELETE } from '@/app/api/staff/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Staff: {
      find: vi.fn(),
      countDocuments: vi.fn(),
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

// POST /api/staff now runs SaaS plan enforcement (getStoreIdBySlug + checkStaffLimit),
// which internally hit the master DB via getMasterModels(). Mock the module so the
// staff route is tested in isolation: no master store -> enforcement is skipped and
// staff creation proceeds (matches non-SaaS default behavior).
vi.mock('@/lib/subscriptionEnforcement', () => ({
  getStoreIdBySlug: vi.fn().mockResolvedValue(null),
  checkStaffLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

describe('Staff API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/staff', () => {
    it('should return list of active staff with pagination', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockStaff = [{ _id: '1', name: 'John Doe', isActive: true }];
      const limitMock = vi.fn().mockResolvedValue(mockStaff);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      
      (models.Staff.find as any).mockReturnValue({ sort: sortMock });
      (models.Staff.countDocuments as any).mockResolvedValue(1);

      const req = new NextRequest('http://localhost/api/staff?page=1&limit=10', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.pagination.total).toBe(1);
      expect(models.Staff.find).toHaveBeenCalledWith({ isActive: true });
    });

    it('should apply search filter', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const limitMock = vi.fn().mockResolvedValue([]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      
      (models.Staff.find as any).mockReturnValue({ sort: sortMock });
      (models.Staff.countDocuments as any).mockResolvedValue(0);

      const req = new NextRequest('http://localhost/api/staff?search=Jane', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      await GET(req, {});

      expect(models.Staff.find).toHaveBeenCalledWith({
        isActive: true,
        name: { $regex: 'Jane', $options: 'i' }
      });
    });
  });

  describe('POST /api/staff', () => {
    it('should create a new staff member', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const newStaff = { name: 'Jane Doe', role: 'Stylist' };
      (models.Staff.create as any).mockResolvedValue({ _id: '2', ...newStaff });

      const req = new NextRequest('http://localhost/api/staff', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify(newStaff),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Jane Doe');
      expect(models.Staff.create).toHaveBeenCalledWith(newStaff);
    });
  });

  describe('PUT /api/staff/[id]', () => {
    it('should update an existing staff member', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const updatedStaff = { _id: '1', name: 'John Smith' };
      (models.Staff.findByIdAndUpdate as any).mockResolvedValue(updatedStaff);

      const req = new NextRequest('http://localhost/api/staff/1', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ name: 'John Smith' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('John Smith');
      expect(models.Staff.findByIdAndUpdate).toHaveBeenCalledWith('1', { name: 'John Smith' }, { new: true });
    });
  });

  describe('DELETE /api/staff/[id]', () => {
    it('should soft delete a staff member', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Staff.findByIdAndUpdate as any).mockResolvedValue({ _id: '1', isActive: false });

      const req = new NextRequest('http://localhost/api/staff/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.Staff.findByIdAndUpdate).toHaveBeenCalledWith('1', { isActive: false });
    });
  });
});
