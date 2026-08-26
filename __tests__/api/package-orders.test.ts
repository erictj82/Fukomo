import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/package-orders/route';
import { PATCH } from '@/app/api/package-orders/[id]/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import mongoose from 'mongoose';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    PackageOrder: {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    },
    ServicePackage: {
      findById: vi.fn(),
    },
    Customer: {
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    CustomerPackage: {
      create: vi.fn(),
    },
    Invoice: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
    // PATCH (paid=true) generates an invoice number (Counter, via generateInvoiceNumber)
    // and records the cash movement + wallet ledger.
    Counter: {
      findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
    WalletTransaction: { create: vi.fn() },
    // Cash payment path reads kasir/brankas/bank off the returned balance doc.
    CashBalance: { findOneAndUpdate: vi.fn().mockResolvedValue({ kasirBalance: 0, brankasBalance: 0, bankBalance: 0 }) },
    CashLog: { create: vi.fn() },
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Package Orders API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/package-orders', () => {
    it('should return list of package orders', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockOrders = [{ _id: '1', status: 'pending' }];
      const populateMock = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: vi.fn().mockResolvedValue(mockOrders)
          })
        })
      });
      (models.PackageOrder.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/package-orders?status=pending', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/package-orders', () => {
    it('should return 400 if package has no items', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const customerId = new mongoose.Types.ObjectId().toString();
      const packageId = new mongoose.Types.ObjectId().toString();

      (models.Customer.findById as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: customerId, name: 'John' })
      });
      (models.ServicePackage.findById as any).mockResolvedValue({
        _id: packageId, isActive: true, items: [] // empty items
      });

      const req = new NextRequest('http://localhost/api/package-orders', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId, packageId }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('no service items');
    });

    it('should create a package order', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const customerId = new mongoose.Types.ObjectId().toString();
      const packageId = new mongoose.Types.ObjectId().toString();

      (models.Customer.findById as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: customerId, name: 'John' })
      });
      (models.ServicePackage.findById as any).mockResolvedValue({
        _id: packageId,
        isActive: true,
        name: 'Gold Package',
        price: 500000,
        items: [{ service: new mongoose.Types.ObjectId(), serviceName: 'Cut', quota: 5 }]
      });

      (models.PackageOrder.create as any).mockResolvedValue({
        _id: 'ord-1',
        amount: 500000,
        orderNumber: 'PKG-123'
      });

      const req = new NextRequest('http://localhost/api/package-orders', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ customerId, packageId }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.PackageOrder.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/package-orders/[id]', () => {
    it('should mark order as pending if paid is false', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockOrder = { _id: 'ord-1', status: 'paid', save: vi.fn() };
      (models.PackageOrder.findById as any).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockOrder)
      });

      const req = new NextRequest('http://localhost/api/package-orders/ord-1', {
        method: 'PATCH',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ paid: false }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(mockOrder.status).toBe('pending');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should create customer package and invoice if paid is true', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockOrder = {
        _id: 'ord-1',
        status: 'pending',
        amount: 500000,
        customer: 'c1',
        activatedCustomerPackage: null,
        packageSnapshot: { name: 'Gold', items: [] },
        save: vi.fn()
      };
      (models.PackageOrder.findById as any).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockOrder)
      });

      (models.CustomerPackage.create as any).mockResolvedValue({ _id: 'cp-1' });
      
      (models.Invoice.findOne as any).mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
      });
      (models.Invoice.create as any).mockResolvedValue({ _id: 'inv-1' });

      const req = new NextRequest('http://localhost/api/package-orders/ord-1', {
        method: 'PATCH',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ paid: true, paymentMethod: 'Cash' }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.CustomerPackage.create).toHaveBeenCalled();
      expect(mockOrder.status).toBe('paid');
      expect(mockOrder.activatedCustomerPackage).toBe('cp-1');
      expect(models.Invoice.create).toHaveBeenCalled();
    });
  });
});
