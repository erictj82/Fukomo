import { describe, it, expect } from 'vitest';
import {
  canViewCorrections,
  hasNamedCorrectionPermission,
  isPrivilegedRole,
  notificationPreview,
  validateCorrectionCreate,
} from '@/lib/correctionPerms';

describe('correction permissions', () => {
  it('Owner/Admin/Super Admin have REQUEST and APPROVE', () => {
    for (const role of ['Owner', 'Admin', 'Super Admin']) {
      expect(isPrivilegedRole(role)).toBe(true);
      expect(hasNamedCorrectionPermission({}, role, 'REQUEST_CORRECTION')).toBe(true);
      expect(hasNamedCorrectionPermission({}, role, 'APPROVE_CORRECTION')).toBe(true);
      expect(canViewCorrections({}, role)).toBe(true);
    }
  });

  it('Cashier with REQUEST_CORRECTION cannot approve', () => {
    const perms = { corrections: { view: 'own', create: true, edit: false, delete: false } };
    expect(hasNamedCorrectionPermission(perms, 'Kasir', 'REQUEST_CORRECTION')).toBe(true);
    expect(hasNamedCorrectionPermission(perms, 'Kasir', 'APPROVE_CORRECTION')).toBe(false);
    expect(canViewCorrections(perms, 'Kasir')).toBe(true);
  });

  it('Manager with APPROVE_CORRECTION can approve', () => {
    const perms = { corrections: { view: 'all', create: false, edit: true, delete: false } };
    expect(hasNamedCorrectionPermission(perms, 'Manager', 'APPROVE_CORRECTION')).toBe(true);
    expect(hasNamedCorrectionPermission(perms, 'Manager', 'REQUEST_CORRECTION')).toBe(false);
  });

  it('staff with no corrections perms is denied', () => {
    expect(hasNamedCorrectionPermission({}, 'Staff', 'REQUEST_CORRECTION')).toBe(false);
    expect(hasNamedCorrectionPermission({ invoices: { create: true } }, 'Staff', 'APPROVE_CORRECTION')).toBe(false);
    expect(canViewCorrections({}, 'Staff')).toBe(false);
  });
});

describe('validateCorrectionCreate', () => {
  it('requires a reason', () => {
    expect(validateCorrectionCreate({
      appointmentId: 'a1', action: 'add', toServiceId: 's2', reason: '   ',
    })).toMatch(/wajib/i);
  });

  it('accepts a valid replace request', () => {
    expect(validateCorrectionCreate({
      appointmentId: 'a1',
      action: 'replace',
      fukomoLineId: 'a1:s1:0',
      toServiceId: 's2',
      reason: 'Salah input layanan',
    })).toBeNull();
  });
});

describe('notificationPreview', () => {
  it('includes customer, WO, services, reason, requester', () => {
    const text = notificationPreview({
      customerName: 'Andi',
      workOrderNumber: '1041',
      fromServiceName: 'Cut',
      toServiceName: 'Color',
      reason: 'Salah pilih',
      requestedByName: 'Kasir Rina',
    });
    expect(text).toContain('Andi');
    expect(text).toContain('1041');
    expect(text).toContain('Cut');
    expect(text).toContain('Color');
    expect(text).toContain('Salah pilih');
    expect(text).toContain('Kasir Rina');
  });
});
