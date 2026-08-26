import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/deposits/route';
import { NextRequest } from 'next/server';
import { checkPermission } from '@/lib/rbac';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Deposit: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
    Invoice: {
      findById: vi.fn(),
    },
    Customer: {
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    WalletTransaction: {
      create: vi.fn(),
    }
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({ error: null, session: { user: { id: 'test-user', role: 'Super Admin' } } }),
}));

describe('Deposits API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkPermission as any).mockResolvedValue(null);
  });

  describe('GET /api/deposits', () => {
    it('should return deposits for an invoice', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const populateMock = vi.fn().mockReturnValue({
        sort: vi.fn().mockResolvedValue([{ _id: 'dep1', amount: 500 }])
      });
      (models.Deposit.find as any).mockReturnValue({ populate: populateMock });

      const req = new NextRequest('http://localhost/api/deposits?invoiceId=inv1', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Deposit.find).toHaveBeenCalledWith({ invoice: 'inv1' });
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/deposits', () => {
    it('should return 400 if amount is invalid', async () => {
      const req = new NextRequest('http://localhost/api/deposits', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: -500 }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Nominal deposit harus lebih dari 0');
    });

    it('should return 400 if wallet payment and insufficient balance', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findById as any).mockResolvedValue({ _id: 'c1', walletBalance: 100 });

      const req = new NextRequest('http://localhost/api/deposits', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: 500, customer: 'c1', paymentMethod: 'wallet' }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Saldo e-wallet tidak mencukupi');
    });

    it('should create deposit and deduct wallet balance', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Customer.findById as any).mockResolvedValue({ _id: 'c1', walletBalance: 1000 });
      (models.Deposit.create as any).mockResolvedValue({ _id: 'dep1', amount: 500 });
      (models.Customer.findOneAndUpdate as any).mockResolvedValue({ _id: 'c1', walletBalance: 500 });
      (models.WalletTransaction.create as any).mockResolvedValue({ _id: 'wt1' });

      const mockInvoice = { _id: 'inv1', amountPaid: 0, totalAmount: 1000, save: vi.fn() };
      (models.Invoice.findById as any).mockResolvedValue(mockInvoice);
      // route recalculates paidAmount from ALL deposits on the invoice (avoids double-counting)
      (models.Deposit.find as any).mockResolvedValue([{ amount: 500 }]);

      const req = new NextRequest('http://localhost/api/deposits', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: 500, customer: 'c1', invoice: 'inv1', paymentMethod: 'wallet' }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.Deposit.create).toHaveBeenCalled();
      expect(models.Customer.findOneAndUpdate).toHaveBeenCalled();
      expect(models.WalletTransaction.create).toHaveBeenCalled();
      
      expect(mockInvoice.amountPaid).toBe(500);
      expect(mockInvoice.status).toBe('partially_paid');
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    it('should create deposit and set invoice status to paid if fully paid', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.Deposit.create as any).mockResolvedValue({ _id: 'dep1', amount: 1000 });
      
      const mockInvoice = { _id: 'inv1', amountPaid: 0, totalAmount: 1000, save: vi.fn() };
      (models.Invoice.findById as any).mockResolvedValue(mockInvoice);
      // route recalculates paidAmount from ALL deposits on the invoice (avoids double-counting)
      (models.Deposit.find as any).mockResolvedValue([{ amount: 1000 }]);

      const req = new NextRequest('http://localhost/api/deposits', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ amount: 1000, invoice: 'inv1', paymentMethod: 'cash' }),
      });

      const res = await POST(req, {});
      
      expect(res.status).toBe(200);
      expect(mockInvoice.amountPaid).toBe(1000);
      expect(mockInvoice.status).toBe('paid');
      expect(mockInvoice.save).toHaveBeenCalled();
    });
  });
});
