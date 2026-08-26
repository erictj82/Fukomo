import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Customer: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
    CustomerPackage: {},
    Counter: {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
  }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
    getViewScope: vi.fn().mockResolvedValue('all'),
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/lib/logger', () => ({
  logActivity: vi.fn(),
}));

describe('Customer API POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if phone number already exists', async () => {
    // Setup the mock to return an existing customer
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');
    (models.Customer.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'existing-id', phone: '08123456789' })
    });

    const req = new NextRequest('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'x-store-slug': 'test-tenant' },
      body: JSON.stringify({
        name: 'Test Customer',
        phone: '08123456789',
      }),
    });

    const res = await POST(req, {});
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Nomor telepon sudah terdaftar untuk customer lain.');
  });

  it('should create customer if phone is unique', async () => {
    // Setup the mock to return null (phone is unique)
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');
    (models.Customer.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    (models.Customer.create as any).mockResolvedValue({ _id: 'new-id', name: 'Test Customer', phone: '08123456789' });

    const req = new NextRequest('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'x-store-slug': 'test-tenant' },
      body: JSON.stringify({
        name: 'Test Customer',
        phone: '08123456789',
      }),
    });

    const res = await POST(req, {});
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Test Customer');
  });
});

import { GET } from './route';

describe('Customer API GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return list of customers', async () => {
    const { getTenantModels } = await import('@/lib/tenantDb');
    const models = await getTenantModels('test-tenant');
    
    const mockCustomers = [
      { _id: '1', name: 'Customer 1', phone: '0811' },
      { _id: '2', name: 'Customer 2', phone: '0822' }
    ];
    
    // Chain mock for find().sort().skip().limit().lean()
    const limitMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockCustomers)
    });
    const skipMock = vi.fn().mockReturnValue({
      limit: limitMock
    });
    const sortMock = vi.fn().mockReturnValue({
      skip: skipMock
    });
    (models.Customer.find as any) = vi.fn().mockReturnValue({
      sort: sortMock
    });

    // Mock countDocuments
    (models.Customer.countDocuments as any) = vi.fn().mockResolvedValue(2);

    // Mock CustomerPackage.find().select().lean()
    const selectMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });
    (models.CustomerPackage.find as any) = vi.fn().mockReturnValue({
      select: selectMock
    });

    const req = new NextRequest('http://localhost/api/customers', {
      headers: { 'x-store-slug': 'test-tenant' },
    });

    const res = await GET(req, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.length).toBe(2);
    expect(data.data[0].name).toBe('Customer 1');
  });
});
