import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/cash-drawer/session/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    CashSession: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
    CashBalance: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
    CashLog: {
      create: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/lib/logger', () => ({
  logActivity: vi.fn(),
}));

describe('Cash Drawer Session API', () => {
  let models: any;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getTenantModels } = await import('@/lib/tenantDb');
    models = await getTenantModels('test-tenant');
  });

  describe('POST action=open', () => {
    it('returns 400 if a session is already open', async () => {
      models.CashSession.findOne.mockResolvedValue({ _id: 'existing', status: 'open' });

      const req = new NextRequest('http://localhost/api/cash-drawer/session', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ action: 'open', startingCash: 500000 }),
      });
      
      const res = await POST(req, {});
      const data = await res.json();
      
      expect(res.status).toBe(400);
      expect(data.error).toBe('A session is already open');
    });

    it('creates a new session and handles discrepancy', async () => {
      models.CashSession.findOne.mockResolvedValue(null);
      const mockBalance = { kasirBalance: 400000, save: vi.fn().mockResolvedValue(true) };
      models.CashBalance.findOne.mockResolvedValue(mockBalance);
      models.CashSession.create.mockResolvedValue({ _id: 'new-session' });

      const req = new NextRequest('http://localhost/api/cash-drawer/session', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ action: 'open', startingCash: 500000 }),
      });
      
      const res = await POST(req, {});
      const data = await res.json();
      
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Balance should be updated to startingCash
      expect(mockBalance.kasirBalance).toBe(500000);
      expect(mockBalance.save).toHaveBeenCalled();
      
      // On OPEN, a modal difference is reconciled AGAINST brankas (kasir +100k, brankas -100k)
      // and logged as a 'transfer' (money sourced from the safe). Only CLOSE discrepancies —
      // unexplained over/short with no counterpart — are logged as 'adjustment'. See route:60 vs :137.
      expect(models.CashLog.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transfer',
        amount: 100000
      }));
      
      // Should create open_session log
      expect(models.CashLog.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'open_session',
        amount: 500000
      }));
    });
  });

  describe('POST action=close', () => {
    it('returns 400 if no active session exists', async () => {
      models.CashSession.findOne.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/cash-drawer/session', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ action: 'close', actualEndingCash: 500000 }),
      });
      
      const res = await POST(req, {});
      const data = await res.json();
      
      expect(res.status).toBe(400);
      expect(data.error).toBe('No active session to close');
    });

    it('closes session and calculates discrepancy', async () => {
      const mockSession: any = { 
        _id: 'active', 
        status: 'open',
        save: vi.fn().mockResolvedValue(true) 
      };
      models.CashSession.findOne.mockResolvedValue(mockSession);
      
      const mockBalance = { kasirBalance: 600000, save: vi.fn().mockResolvedValue(true) };
      models.CashBalance.findOne.mockResolvedValue(mockBalance);

      const req = new NextRequest('http://localhost/api/cash-drawer/session', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ action: 'close', actualEndingCash: 500000, notes: 'Missing 100k' }),
      });
      
      const res = await POST(req, {});
      const data = await res.json();
      
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Expected = 600k, Actual = 500k, Discrepancy = -100k
      expect(mockSession.expectedEndingCash).toBe(600000);
      expect(mockSession.actualEndingCash).toBe(500000);
      expect(mockSession.discrepancy).toBe(-100000);
      expect(mockSession.status).toBe('closed');
      expect(mockSession.save).toHaveBeenCalled();
      
      // Balance should be updated to actual
      expect(mockBalance.kasirBalance).toBe(500000);
      expect(mockBalance.save).toHaveBeenCalled();
    });
  });

  it('returns 400 for invalid action', async () => {
    const req = new NextRequest('http://localhost/api/cash-drawer/session', {
      method: 'POST',
      headers: { 'x-store-slug': 'test-tenant' },
      body: JSON.stringify({ action: 'invalid' }),
    });
    
    const res = await POST(req, {});
    expect(res.status).toBe(400);
  });
});
