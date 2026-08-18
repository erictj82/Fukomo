import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks (vi.mock is hoisted, so no external variable references) ─────

vi.mock('@/lib/tenantDb', () => {
  const mockCustomerData = [
    { _id: 'c1', name: 'Alice', phone: '628111111111', membershipTier: 'regular', waNotifEnabled: true },
    { _id: 'c2', name: 'Bob', phone: '628222222222', membershipTier: 'premium', waNotifEnabled: true },
  ];

  // Build a chainable mock that supports both GET (select→sort→limit→lean) and POST (select→lean)
  const selectMock = vi.fn().mockImplementation(() => ({
    lean: vi.fn().mockResolvedValue(mockCustomerData),
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockCustomerData),
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCustomerData),
      }),
    }),
  }));

  return {
    getTenantModels: vi.fn().mockResolvedValue({
      Customer: {
        find: vi.fn().mockReturnValue({ select: selectMock }),
        aggregate: vi.fn().mockResolvedValue([]),
      },
    Invoice: {
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    WaBlastLog: {
      create: vi.fn().mockResolvedValue({ _id: 'log1' }),
    },
    WaCampaignQueue: {
      create: vi.fn().mockResolvedValue({ _id: 'camp1' }),
    },
    WaTemplate: {
      findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    },
    Settings: {
      findOne: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ fonnteToken: 'test-token', storeName: 'TestSalon' }),
      }),
    },
    }),
  };
});

vi.mock('@/lib/rbac', async (importOriginal) => ({
  ...(await importOriginal() as any),
  // checkPermissionWithSession dibiarkan ASLI (baca auth() yang di-mock) supaya
  // jalur auth/unauth benar; hanya checkPermission (lama) yang di-stub permisif.
  checkPermission: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user1', role: 'Super Admin' } }),
}));

const mockSendWhatsApp = vi.fn().mockResolvedValue({ success: true, data: { status: true } });
vi.mock('@/lib/fonnte', () => ({
  sendWhatsApp: (...args: any[]) => mockSendWhatsApp(...args),
}));

// Route memanggil getWaProviderConfigForPurpose(settings,'campaign'). Implementasi asli
// pakai require('@/lib/encryption') yang tidak resolve alias '@/' di runtime vitest (di
// prod di-handle webpack). Mock fixed fonnte config supaya jalur kirim (sendWhatsApp) tetap teruji.
vi.mock('@/lib/waProvider', () => ({
  getWaProviderConfigForPurpose: vi.fn().mockReturnValue({ provider: 'fonnte', fonnteToken: 'test-token' }),
  extractTemplateVariables: vi.fn().mockReturnValue([]),
}));

// ── Tests ─────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/wa/blast-targets/route';

describe('WA Blast Targets API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsApp.mockResolvedValue({ success: true, data: { status: true } });
  });

  describe('GET /api/wa/blast-targets', () => {
    it('returns filtered customer list with phone numbers', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.total).toBe(2);
      expect(data.data).toHaveLength(2);
    });

    it('applies membership tier filter', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets?membershipTier=premium', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      await GET(req, {});

      expect(models.Customer.find).toHaveBeenCalledWith(
        expect.objectContaining({ membershipTier: 'premium' })
      );
    });
  });

  describe('POST /api/wa/blast-targets', () => {
    it('returns 400 if message is empty', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: ['c1'], message: '' }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
    });

    it('returns 400 if no customers selected', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: [], message: 'Hello!' }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
    });

    it('queues blast ke WaCampaignQueue & balikin targetCount (tidak kirim langsung)', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIds: ['c1', 'c2'],
          message: 'Hello {{nama_customer}}!',
          campaignName: 'Test Campaign',
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.queued).toBe(true);
      expect(data.targetCount).toBe(2);
      expect(data.campaignId).toBe('camp1');

      // Queue-based (BLAST-01): TIDAK kirim langsung — scheduler yang pickup nanti.
      expect(mockSendWhatsApp).not.toHaveBeenCalled();

      const { getTenantModels } = await import('@/lib/tenantDb');
      const models: any = await getTenantModels('test-tenant');
      expect(models.WaCampaignQueue.create).toHaveBeenCalledTimes(1);
      const createArg = models.WaCampaignQueue.create.mock.calls[0][0];
      expect(createArg.campaignName).toBe('Test Campaign');
      expect(createArg.message).toBe('Hello {{nama_customer}}!');
      expect(createArg.status).toBe('pending');
      expect(createArg.targets).toHaveLength(2);
      expect(createArg.targets.every((t: any) => t.status === 'pending')).toBe(true);
    });

    it('menyimpan sentBy dari session & phone ter-normalisasi di targets', async () => {
      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: ['c1', 'c2'], message: 'Halo!' }),
      });

      await POST(req, {});

      const { getTenantModels } = await import('@/lib/tenantDb');
      const models: any = await getTenantModels('test-tenant');
      const createArg = models.WaCampaignQueue.create.mock.calls[0][0];
      expect(createArg.sentBy).toBe('user1'); // dari auth() mock Super Admin
      expect(createArg.targets.map((t: any) => t.phone)).toEqual(['628111111111', '628222222222']);
      expect(createArg.targets[0]).toEqual(
        expect.objectContaining({ customerId: 'c1', phone: '628111111111', status: 'pending' }),
      );
    });

    it('returns 400 jika tidak ada customer dengan nomor WA valid (queue tidak dibuat)', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models: any = await getTenantModels('test-tenant');
      // Override sekali: Customer.find(...).select(...).lean() → [] (tak ada WA valid)
      models.Customer.find.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
      });

      const req = new NextRequest('http://localhost/api/wa/blast-targets', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: ['c1'], message: 'Hello!' }),
      });

      const res = await POST(req, {});
      expect(res.status).toBe(400);
      expect(models.WaCampaignQueue.create).not.toHaveBeenCalled();
    });
  });
});
