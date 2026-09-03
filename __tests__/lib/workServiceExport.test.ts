import { describe, it, expect } from 'vitest';
import { serviceDocToExportRow, WORK_SERVICE_EXPORT_HEADERS } from '@/lib/workServiceExport';

describe('serviceDocToExportRow', () => {
  it('maps Fukomo catalog fields including harga and komisi', () => {
    const row = serviceDocToExportRow({
      _id: 'abc',
      name: 'Potong Pria',
      category: { name: 'Potong' },
      duration: 45,
      price: 75000,
      memberPrice: 65000,
      commissionType: 'fixed',
      commissionValue: 15000,
      sellingCommissionType: 'percentage',
      sellingCommissionValue: 10,
      description: 'cut',
      status: 'active',
    });
    expect(Object.keys(row)).toEqual([...WORK_SERVICE_EXPORT_HEADERS]);
    expect(row.harga).toBe(75000);
    expect(row.harga_member).toBe(65000);
    expect(row.komisi_tipe).toBe('fixed');
    expect(row.komisi_nilai).toBe(15000);
    expect(row.komisi_jual_nilai).toBe(10);
    expect(row.kategori_skill).toBe('Potong');
    expect(row.status).toBe('active');
  });
});
