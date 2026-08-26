import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/staff-slots/route';
import { DELETE } from '@/app/api/staff-slots/[id]/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: vi.fn().mockResolvedValue({
    StaffSlot: {
      find: vi.fn(),
      deleteMany: vi.fn(),
      insertMany: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
    Appointment: {
      find: vi.fn(),
    },
    Staff: {
      findById: vi.fn(),
    },
    // GET reads double-booking flag via `await Settings.findOne()` (route line
    // ~143), awaited directly (no .lean()). Default null -> allowDoubleBooking false.
    Settings: {
      findOne: vi.fn().mockResolvedValue(null),
    }
  }),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/lib/rbac', async () => {
  const authMod: any = await import('@/auth');
  return {
    checkPermission: vi.fn().mockResolvedValue(null),
    checkPermissionWithSession: vi.fn(async () => ({ error: null, session: await authMod.auth() })),
  };
});

describe('Staff Slots API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/staff-slots', () => {
    it('should return 400 if staffId is missing', async () => {
      const req = new NextRequest('http://localhost/api/staff-slots', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('staffId is required');
    });

    it('should return slots for a day type', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockSlots = [{ _id: '1', startTime: '10:00', endTime: '11:00', isAvailable: true }];
      const sortMock = vi.fn().mockResolvedValue(mockSlots);
      (models.StaffSlot.find as any).mockReturnValue({ sort: sortMock });
      
      (models.Staff.findById as any).mockResolvedValue({ _id: 's1', workingDays: [] });

      const req = new NextRequest('http://localhost/api/staff-slots?staffId=s1&type=day&dayOfWeek=Monday', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.availableSlots.length).toBe(1);
    });

    it('should mark slot as booked if conflicts with appointment on date type', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      const mockSlots = [
        { _id: '1', startTime: '10:00', endTime: '11:00', isAvailable: true },
        { _id: '2', startTime: '11:00', endTime: '12:00', isAvailable: true }
      ];
      const sortMockSlot = vi.fn().mockResolvedValue(mockSlots);
      (models.StaffSlot.find as any).mockReturnValue({ sort: sortMockSlot });
      
      const mockAppointments = [{ _id: 'a1', startTime: '10:00', endTime: '10:30' }];
      const sortMockAppt = vi.fn().mockResolvedValue(mockAppointments);
      (models.Appointment.find as any).mockReturnValue({ sort: sortMockAppt });

      (models.Staff.findById as any).mockResolvedValue({ _id: 's1', workingDays: [] });

      const req = new NextRequest('http://localhost/api/staff-slots?staffId=s1&type=date&date=2024-01-01', {
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      // First slot should be marked unavailable due to appointment
      expect(data.data.availableSlots[0].isAvailable).toBe(false);
      // Second slot is still available
      expect(data.data.availableSlots[1].isAvailable).toBe(true);
      expect(data.data.bookedSlots).toContain('10:00');
    });
  });

  describe('POST /api/staff-slots', () => {
    it('should validate required fields', async () => {
      const req = new NextRequest('http://localhost/api/staff-slots', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({ staffId: 's1', type: 'date' }), // missing slots
      });

      const res = await POST(req, {});
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should create slots and delete old ones for day type', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.StaffSlot.deleteMany as any).mockResolvedValue({});
      (models.StaffSlot.insertMany as any).mockResolvedValue([{ _id: '1' }]);

      const req = new NextRequest('http://localhost/api/staff-slots', {
        method: 'POST',
        headers: { 'x-store-slug': 'test-tenant' },
        body: JSON.stringify({
          staffId: 's1',
          type: 'day',
          dayOfWeek: 'Monday',
          slots: [{ startTime: '10:00', endTime: '11:00' }]
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(models.StaffSlot.deleteMany).toHaveBeenCalledWith({ staff: 's1', type: 'day', dayOfWeek: 'Monday' });
      expect(models.StaffSlot.insertMany).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/staff-slots/[id]', () => {
    it('should delete slot successfully', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.StaffSlot.findByIdAndDelete as any).mockResolvedValue({ _id: '1' });

      const req = new NextRequest('http://localhost/api/staff-slots/1', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(models.StaffSlot.findByIdAndDelete).toHaveBeenCalledWith('1');
    });

    it('should return 404 if slot not found', async () => {
      const { getTenantModels } = await import('@/lib/tenantDb');
      const models = await getTenantModels('test-tenant');

      (models.StaffSlot.findByIdAndDelete as any).mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/staff-slots/99', {
        method: 'DELETE',
        headers: { 'x-store-slug': 'test-tenant' },
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: '99' }) });
      expect(res.status).toBe(404);
    });
  });
});
