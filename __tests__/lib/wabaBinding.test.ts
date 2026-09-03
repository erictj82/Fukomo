import { describe, it, expect } from 'vitest';
import {
  wabaLicensesFingerprint,
  normalizeWabaPhone,
  isTemplateBoundToCurrentWaba,
  templateSendReady,
  annotateWabaTemplate,
  extractWabaPhoneFromPayload,
  groupTemplatesIntoFolders,
  applyFolderLabels,
  defaultFolderLabel,
  templateFolderKey,
} from '@/lib/wabaBinding';

const fpA = wabaLicensesFingerprint('license-pusat');
const fpB = wabaLicensesFingerprint('license-coba1');
const bindPusat = { fingerprint: fpA, phone: '628111111111' };

describe('wabaBinding — folder per nomor', () => {
  it('fingerprint berbeda untuk licenses berbeda', () => {
    expect(fpA).toBeTruthy();
    expect(fpA).not.toBe(fpB);
  });

  it('template folder = nomor WABA-nya', () => {
    expect(templateFolderKey({ wabaPhone: '0812-1111-1111' })).toBe('6281211111111');
  });

  it('APPROVED di folder nomor setting → aktif', () => {
    const t = {
      metaStatus: 'APPROVED',
      metaTemplateName: 'fu_ke1_30hr_dd',
      wabaLicensesFingerprint: fpA,
      wabaPhone: '628111111111',
    };
    expect(templateSendReady(t, bindPusat)).toBe(true);
    expect(annotateWabaTemplate(t, bindPusat).usable).toBe(true);
  });

  it('APPROVED di folder nomor lain → tidak aktif', () => {
    const t = {
      metaStatus: 'APPROVED',
      metaTemplateName: 'fu_ke1_30hr_dd',
      wabaLicensesFingerprint: fpB,
      wabaPhone: '628222222222',
    };
    expect(isTemplateBoundToCurrentWaba(t, bindPusat)).toBe(false);
    const ann = annotateWabaTemplate(t, bindPusat);
    expect(ann.usable).toBe(false);
    expect(String(ann.unusableReason)).toMatch(/folder/i);
  });

  it('tanpa nomor → folder unfiled, tidak aktif', () => {
    const t = { metaStatus: 'APPROVED', metaTemplateName: 'fu_ke1_30hr_dd' };
    expect(templateSendReady(t, bindPusat)).toBe(false);
    expect(String(annotateWabaTemplate(t, bindPusat).unusableReason)).toMatch(/folder/i);
  });

  it('groupFolders: nomor A aktif, nomor B tidak', () => {
    const folders = groupTemplatesIntoFolders([
      { name: 'a1', wabaPhone: '628111111111', metaStatus: 'APPROVED', metaTemplateName: 'a1' },
      { name: 'b1', wabaPhone: '628222222222', metaStatus: 'APPROVED', metaTemplateName: 'b1' },
    ], bindPusat);
    expect(folders[0].active).toBe(true);
    expect(folders[0].phone).toBe('628111111111');
    expect(folders[0].templates.map((t: any) => t.name)).toEqual(['a1']);
    const other = folders.find((f) => f.phone === '628222222222');
    expect(other?.active).toBe(false);
    expect(other?.templates.map((t: any) => t.name)).toEqual(['b1']);
  });

  it('applyFolderLabels: rename kustom, kosong kembali ke default', () => {
    const folders = groupTemplatesIntoFolders([
      { name: 'b1', wabaPhone: '628222222222' },
    ], bindPusat);
    const inactive = folders.find((f) => f.phone === '628222222222')!;
    const renamed = applyFolderLabels(folders, { '628222222222': 'Nomor lama Pusat 0812' });
    expect(renamed.find((f) => f.key === inactive.key)?.label).toBe('Nomor lama Pusat 0812');
    expect(applyFolderLabels([inactive], { '628222222222': '  ' })[0].label).toBe(defaultFolderLabel('628222222222'));
  });

  it('normalize nomor 08xx → 628xx', () => {
    expect(normalizeWabaPhone('0812-3456-7890')).toBe('6281234567890');
  });

  it('extract phone dari payload BalesOtomatis kalau ada', () => {
    expect(extractWabaPhoneFromPayload({
      templates: [{ template_name: 'x', phone_number: '081234567890' }],
    })).toBe('6281234567890');
  });
});
