import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks (all inline to avoid vi.mock hoisting issues) ─────

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    Settings: {
      findOne: vi.fn().mockResolvedValue({
        storeName: 'TestSalon',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        taxRate: 10,
        logoUrl: '',
        address: 'Jl. Testing 123',
        phone: '628111111111',
        email: 'test@salon.com',
        website: '',
        businessHours: 'Mon-Fri: 9-6',
        memberDiscountType: 'percentage',
        memberDiscountValue: 10,
        memberIncludedServices: [],
        memberIncludedProducts: [],
        memberIncludedBundles: [],
        loyaltyPointValue: 1,
        referralRewardPoints: 100,
        referralDiscountType: 'nominal',
        referralDiscountValue: 10000,
        showCommissionInPOS: false,
        walletIncludedServices: [],
        walletIncludedProducts: [],
        walletIncludedBundles: [],
        fonnteToken: 'test-token',
        waAdminNumber: '628123456789',
        waOwnerNumber: '628987654321',
        waTemplateStockAlert: 'stock template',
        waTemplateDailyReport: 'report template',
        waTemplateMembershipExpiry: 'membership template',
        waTemplatePackageExpiry: 'package template',
      }),
      findOneAndUpdate: vi.fn().mockImplementation((_q: any, body: any) =>
        Promise.resolve({
          storeName: 'TestSalon',
          currency: 'IDR',
          fonnteToken: 'test-token',
          waTemplateStockAlert: '',
          waTemplateDailyReport: '',
          waTemplateMembershipExpiry: '',
          waTemplatePackageExpiry: '',
          ...body,
        })
      ),
      create: vi.fn().mockResolvedValue({ storeName: 'TestSalon' }),
    },
  }),
}));

vi.mock('@/lib/rbac', async (importOriginal) => ({
  ...(await importOriginal() as any),
  // checkPermissionWithSession dibiarkan ASLI (baca auth() yang di-mock) supaya
  // test "rejects unauthenticated" (auth→null) tetap mengembalikan 401.
  checkPermission: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'Super Admin' } }),
}));

// ── Tests ─────────────────────────────────────────────────────────────

import { GET, PUT } from '@/app/api/settings/route';

describe('Settings API — WA Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('returns full settings including WA template fields for authenticated users', async () => {
      const req = new NextRequest('http://localhost/api/settings', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('waTemplateStockAlert');
      expect(data.data).toHaveProperty('waTemplateDailyReport');
      expect(data.data).toHaveProperty('waTemplateMembershipExpiry');
      expect(data.data).toHaveProperty('waTemplatePackageExpiry');
    });

    it('returns only public fields for unauthenticated users (no WA templates)', async () => {
      const { auth } = await import('@/auth');
      (auth as any).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/settings', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // Public view should NOT contain WA templates
      expect(data.data).not.toHaveProperty('waTemplateStockAlert');
      expect(data.data).not.toHaveProperty('fonnteToken');
    });
  });

  describe('PUT /api/settings', () => {
    it('saves WA template fields successfully', async () => {
      const templatePayload = {
        waTemplateStockAlert: '⚠️ Stok rendah: {{productList}}',
        waTemplateDailyReport: '📊 Pendapatan: Rp{{totalAmount}}',
        waTemplateMembershipExpiry: 'Halo {{customerName}}, membership habis {{daysLeft}} hari lagi.',
        waTemplatePackageExpiry: 'Halo {{customerName}}, paket {{packageName}} habis {{daysLeft}} hari lagi.',
      };

      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload),
      });

      const res = await PUT(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.waTemplateStockAlert).toBe(templatePayload.waTemplateStockAlert);
      expect(data.data.waTemplateDailyReport).toBe(templatePayload.waTemplateDailyReport);
      expect(data.data.waTemplateMembershipExpiry).toBe(templatePayload.waTemplateMembershipExpiry);
      expect(data.data.waTemplatePackageExpiry).toBe(templatePayload.waTemplatePackageExpiry);
    });

    it('rejects unauthenticated updates', async () => {
      const { auth } = await import('@/auth');
      (auth as any).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ waTemplateStockAlert: 'hack attempt' }),
      });

      const res = await PUT(req, {});
      expect(res.status).toBe(401);
    });

    it('preserves existing settings when only updating templates', async () => {
      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ waTemplatePackageExpiry: 'Custom template' }),
      });

      const res = await PUT(req, {});
      const data = await res.json();

      expect(data.data.storeName).toBe('TestSalon'); // original preserved
      expect(data.data.waTemplatePackageExpiry).toBe('Custom template'); // new field saved
    });
  });
});
