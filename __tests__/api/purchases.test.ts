import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/purchases/route';
import { GET as GET_ONE, DELETE } from '@/app/api/purchases/[id]/route';
import { GET as GET_DEPOSITS, POST as POST_DEPOSIT } from '@/app/api/purchases/deposits/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Purchase: {
      find: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
    Product: {
      findById: vi.fn(),
    },
    Supplier: {
      find: vi.fn(),
    },
    PurchaseDeposit: {
      find: vi.fn(),
      create: vi.fn(),
    },
    // POST /api/purchases generates its PO number via Counter.findByIdAndUpdate;
    // the route reads `.seq` off the returned doc (→ PUR-2024-00001).
    Counter: {
      findByIdAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Purchases API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/purchases', () => {
    it('should return paginated purchases', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Purchase.countDocuments as any).mockResolvedValue(1);

      const limitMock = vi.fn().mockResolvedValue([{ purchaseNumber: 'PUR-001' }]);
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
      const populateMock2 = vi.fn().mockReturnValue({ sort: sortMock });
      const populateMock1 = vi.fn().mockReturnValue({ populate: populateMock2 });
      (models.Purchase.find as any).mockReturnValue({ populate: populateMock1 });

      const req = new NextRequest('http://localhost/api/purchases', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/purchases', () => {
    it('should create a purchase and update product stock if received', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');
      const originalPurchase = models.Purchase;

      (models.Purchase.countDocuments as any).mockResolvedValue(0);

      const mockProduct = { _id: 'p1', stock: 10, save: vi.fn() };
      (models.Product.findById as any).mockResolvedValue(mockProduct);

      // Using a mock class for Purchase creation
      const mockSave = vi.fn();
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01'));

      const payload = {
        supplier: 's1',
        status: 'received',
        items: [{ product: 'p1', quantity: 5 }]
      };

      // Since we need to mock "new Purchase", we can override the models.Purchase temporarily
      const MockPurchase = function(data: any) {
        Object.assign(this, data);
        this.save = mockSave;
      };
      MockPurchase.countDocuments = models.Purchase.countDocuments;
      (models as any).Purchase = MockPurchase;

      const req = new NextRequest('http://localhost/api/purchases', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.purchaseNumber).toBe('PUR-2024-00001');
      expect(mockProduct.stock).toBe(15); // 10 + 5
      expect(mockProduct.save).toHaveBeenCalled();
      expect(mockSave).toHaveBeenCalled();
      
      // Restore
      (models as any).Purchase = originalPurchase;
      vi.useRealTimers();
    });
  });

  describe('GET /api/purchases/[id]', () => {
    it('should return a specific purchase', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock3 = vi.fn().mockResolvedValue({ _id: 'pur1' });
      const populateMock2 = vi.fn().mockReturnValue({ populate: populateMock3 });
      const populateMock1 = vi.fn().mockReturnValue({ populate: populateMock2 });
      (models.Purchase.findById as any).mockReturnValue({ populate: populateMock1 });

      const req = new NextRequest('http://localhost/api/purchases/pur1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_ONE(req as any, { params: Promise.resolve({ id: 'pur1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('DELETE /api/purchases/[id]', () => {
    it('should delete a purchase and revert stock if received', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockPurchase = {
        _id: 'pur1',
        status: 'received',
        items: [{ product: 'p1', quantity: 5 }]
      };
      (models.Purchase.findById as any).mockResolvedValue(mockPurchase);

      const mockProduct = { _id: 'p1', stock: 15, save: vi.fn() };
      (models.Product.findById as any).mockResolvedValue(mockProduct);

      (models.Purchase.findByIdAndDelete as any).mockResolvedValue({});

      const req = new NextRequest('http://localhost/api/purchases/pur1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'pur1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(mockProduct.stock).toBe(10); // 15 - 5
      expect(mockProduct.save).toHaveBeenCalled();
      expect(models.Purchase.findByIdAndDelete).toHaveBeenCalledWith('pur1');
    });
  });

  describe('POST /api/purchases/deposits', () => {
    it('should create deposit and update purchase paymentStatus', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.PurchaseDeposit.create as any).mockResolvedValue({ _id: 'dep1', amount: 500 });
      
      const mockPurchase = { _id: 'pur1', paidAmount: 0, totalAmount: 1000, save: vi.fn() };
      (models.Purchase.findById as any).mockResolvedValue(mockPurchase);

      const req = new NextRequest('http://localhost/api/purchases/deposits', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ purchase: 'pur1', amount: 500, paymentMethod: 'cash' }),
      });

      const res = await POST_DEPOSIT(req as any, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.PurchaseDeposit.create).toHaveBeenCalled();
      expect(mockPurchase.paidAmount).toBe(500);
      expect(mockPurchase.paymentStatus).toBe('partially_paid');
      expect(mockPurchase.save).toHaveBeenCalled();
    });
  });

  describe('GET /api/purchases/deposits', () => {
    it('should fetch deposits', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const sortMock = vi.fn().mockResolvedValue([{ _id: 'dep1' }]);
      const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
      (models.PurchaseDeposit.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/purchases/deposits?purchaseId=pur1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET_DEPOSITS(req as any, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.PurchaseDeposit.find).toHaveBeenCalledWith({ purchase: 'pur1' });
    });
  });
});
