import { describe, it, expect } from 'vitest';
import { fallbackAppointmentLines, linesFromWorkJobs } from '@/lib/correctionLines';

describe('linesFromWorkJobs', () => {
  it('uses the completed Work service name, not the original booking name', () => {
    const lines = linesFromWorkJobs([
      {
        id: 'job-1',
        status: 'completed',
        service_name: 'Collagen Perm L',
        original_service_name: 'Collagen Perm S',
        fukomo_line_id: '',
        fukomo_service_id: 'svc-l',
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Collagen Perm L');
    expect(lines[0].fukomoLineId).toBe('job:job-1');
    expect(lines[0].jobId).toBe('job-1');
  });

  it('skips cancelled jobs and keeps real fukomo_line_id when present', () => {
    const lines = linesFromWorkJobs([
      { id: 'j-old', status: 'cancelled', service_name: 'Collagen Perm S' },
      { id: 'j-new', status: 'completed', service_name: 'Collagen Perm L', fukomo_line_id: 'apt:svc:0' },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].fukomoLineId).toBe('apt:svc:0');
    expect(lines[0].name).toBe('Collagen Perm L');
  });
});

describe('fallbackAppointmentLines', () => {
  it('always gives a selectable id even when fukomoLineId is empty', () => {
    const lines = fallbackAppointmentLines({
      _id: 'apt1',
      services: [{ name: 'Collagen Perm S', service: 'svc-s' }],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].fukomoLineId).toBe('apt1:svc-s:0');
    expect(lines[0].name).toBe('Collagen Perm S');
  });
});
