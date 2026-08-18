import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// PUT /api/wa/automations/[id] pakai whitelist field (fix BUG-08/SEC-04) supaya field internal
// (lastRunDate, _id, createdAt) gak bisa dimanipulasi. Kontrak yang dijaga di sini:
// waTemplateId (link ke template WABA untuk kategori customer-facing) HARUS ikut ke-whitelist —
// kalau ke-drop, klien link template lewat Edit rule → gak pernah ke-persist (silent fail).

const { mockFindByIdAndUpdate } = vi.hoisted(() => ({
  mockFindByIdAndUpdate: vi.fn(),
}));

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    WaAutomation: { findByIdAndUpdate: mockFindByIdAndUpdate },
  }),
}));

vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(null),
}));

import { PUT } from '@/app/api/wa/automations/[id]/route';

const call = async (body: any) => {
  const req = new NextRequest('http://localhost/api/wa/automations/rule1', {
    method: 'PUT',
    headers: { 'x-store-slug': 'coba1', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await PUT(req, { params: Promise.resolve({ id: 'rule1' }) });
  const data = await res.json();
  const update = mockFindByIdAndUpdate.mock.calls[0]?.[1];
  return { res, data, update };
};

describe('PUT /api/wa/automations/[id] — waTemplateId whitelist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Balikin dokumen truthy biar route gak 404; echo update biar gampang di-assert.
    mockFindByIdAndUpdate.mockImplementation((id: string, upd: any) =>
      Promise.resolve({ _id: id, ...upd })
    );
  });

  it('link template WABA → waTemplateId ikut ter-persist di update', async () => {
    const { res, update } = await call({ waTemplateId: 'tpl123', isActive: true });
    expect(res.status).toBe(200);
    expect(update.waTemplateId).toBe('tpl123');
    expect(update.isActive).toBe(true);
  });

  it('unlink (string kosong) → waTemplateId di-set null, bukan ""', async () => {
    const { update } = await call({ waTemplateId: '' });
    expect(update.waTemplateId).toBeNull();
  });

  it('tanpa waTemplateId → key tidak ada di update (gak clobber existing link)', async () => {
    const { update } = await call({ messageTemplate: 'halo' });
    expect('waTemplateId' in update).toBe(false);
    expect(update.messageTemplate).toBe('halo');
  });

  it('field internal (lastRunDate/_id) tetap ditolak whitelist', async () => {
    const { update } = await call({ waTemplateId: 'tpl1', lastRunDate: '2020-01-01', _id: 'hacked' });
    expect('lastRunDate' in update).toBe(false);
    expect('_id' in update).toBe(false);
    expect(update.waTemplateId).toBe('tpl1');
  });
});
