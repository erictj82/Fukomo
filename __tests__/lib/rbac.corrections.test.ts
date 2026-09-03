import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

function req(slug = 'pusat') {
  return new NextRequest('http://localhost/api/corrections', {
    headers: { 'x-store-slug': slug },
  });
}

describe('requireCorrectionAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks cashier without REQUEST_CORRECTION', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: {
        id: 'u1',
        role: 'Kasir',
        tenantSlug: 'pusat',
        permissions: { invoices: { create: true } },
      },
    });
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    const result = await requireCorrectionAccess(req(), 'request');
    expect(result.error?.status).toBe(403);
  });

  it('allows cashier with REQUEST_CORRECTION to request but not approve', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: {
        id: 'u1',
        role: 'Kasir',
        tenantSlug: 'pusat',
        permissions: { corrections: { view: 'own', create: true, edit: false } },
      },
    });
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    const requestOk = await requireCorrectionAccess(req(), 'request');
    expect(requestOk.error).toBeNull();
    const approve = await requireCorrectionAccess(req(), 'approve');
    expect(approve.error?.status).toBe(403);
  });

  it('allows Manager/Owner to approve', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'u2', role: 'Owner', tenantSlug: 'pusat', permissions: {} },
    });
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    const result = await requireCorrectionAccess(req(), 'approve');
    expect(result.error).toBeNull();
  });

  it('rejects a slug that does not match the session tenant', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'u2', role: 'Owner', tenantSlug: 'pusat', permissions: {} },
    });
    const { requireCorrectionAccess } = await import('@/lib/rbac');
    const result = await requireCorrectionAccess(req('coba1'), 'view');
    expect(result.error?.status).toBe(403);
  });
});
