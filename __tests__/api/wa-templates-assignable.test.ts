import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// GET /api/wa/templates?assignable=1 dipakai dropdown assignment (mis. follow-up per-service).
// Kontrak yang dijaga: tenant WABA-mode HANYA boleh nampilin template APPROVED (karena scheduler
// Fase 1 gak fallback ke free-text), tapi tenant Fonnte-only tetap tampil semua (free-text valid).

const {
  mockGetWaProviderConfigForPurpose,
  mockTestWaba,
  mockFind,
  mockSettingsLean,
} = vi.hoisted(() => ({
  mockGetWaProviderConfigForPurpose: vi.fn(),
  mockTestWaba: vi.fn().mockResolvedValue({ success: false }),
  mockFind: vi.fn(() => ({ sort: vi.fn().mockResolvedValue([]) })),
  mockSettingsLean: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    WaTemplate: { find: mockFind, create: vi.fn() },
    Settings: { findOne: vi.fn(() => ({ lean: mockSettingsLean })) },
  }),
}));

vi.mock('@/lib/waProvider', () => ({
  getWaProviderConfigForPurpose: mockGetWaProviderConfigForPurpose,
  createBalesOtomatisTemplate: vi.fn(),
  testBalesOtomatisWaba: mockTestWaba,
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
  checkPermissionWithSession: vi.fn().mockResolvedValue({
    error: null,
    session: { user: { id: 'u1', role: 'Super Admin' } },
  }),
}));

import { GET } from '@/app/api/wa/templates/route';

const WABA = { provider: 'balesotomatis', balesotomatis: { mode: 'waba', secretKey: 'sk', licensesKey: 'lk' } };
const FONNTE = { provider: 'fonnte', fonnteToken: 'ft' };

describe('GET /api/wa/templates — assignable filter (dropdown follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTestWaba.mockResolvedValue({ success: false }); // skip sync Meta biar find cuma kepanggil sekali
    mockFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    mockSettingsLean.mockResolvedValue({});
  });

  const call = async (url: string) => {
    const req = new NextRequest(url, { headers: { 'x-store-slug': 'coba1' } });
    const res = await GET(req, {});
    const data = await res.json();
    return { res, data };
  };

  it('WABA-mode + assignable=1 → query filter metaStatus APPROVED & waba:true', async () => {
    mockGetWaProviderConfigForPurpose.mockReturnValue(WABA);

    const { res, data } = await call('http://localhost/api/wa/templates?type=follow_up&assignable=1');

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.waba).toBe(true);
    const query = mockFind.mock.calls[0][0];
    expect(query.metaStatus).toBe('APPROVED');
  });

  it('Fonnte-only + assignable=1 → TIDAK filter status (free-text) & waba:false', async () => {
    mockGetWaProviderConfigForPurpose.mockReturnValue(FONNTE);

    const { data } = await call('http://localhost/api/wa/templates?type=follow_up&assignable=1');

    expect(data.waba).toBe(false);
    const query = mockFind.mock.calls[0][0];
    expect(query.metaStatus).toBeUndefined();
  });

  it('WABA-mode TANPA assignable → tidak filter status (list management tetap penuh)', async () => {
    mockGetWaProviderConfigForPurpose.mockReturnValue(WABA);

    const { data } = await call('http://localhost/api/wa/templates?type=follow_up');

    expect(data.waba).toBe(true);
    const query = mockFind.mock.calls[0][0];
    expect(query.metaStatus).toBeUndefined();
  });

  it('WABA-mode + assignable=1 → hanya template APPROVED yang terikat nomor setting', async () => {
    mockGetWaProviderConfigForPurpose.mockReturnValue(WABA);
    const { wabaLicensesFingerprint } = await import('@/lib/wabaBinding');
    const fp = wabaLicensesFingerprint('lk');
    mockFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([
        { _id: 'ok', name: 'mine', metaStatus: 'APPROVED', metaTemplateName: 'mine', wabaLicensesFingerprint: fp, wabaPhone: '62811' },
        { _id: 'other', name: 'other', metaStatus: 'APPROVED', metaTemplateName: 'other', wabaLicensesFingerprint: 'deadbeefdeadbeef', wabaPhone: '62899' },
      ]),
    });

    const { data } = await call('http://localhost/api/wa/templates?type=follow_up&assignable=1');

    expect(data.waba).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0]._id).toBe('ok');
    expect(data.data[0].usable).toBe(true);
  });
});
