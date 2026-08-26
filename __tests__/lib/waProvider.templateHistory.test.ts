import { describe, it, expect } from 'vitest';
import { appendWaTemplateHistory, parseMetaTimestamp, MAX_WA_TEMPLATE_HISTORY } from '@/lib/waProvider';

describe('appendWaTemplateHistory', () => {
    it('menambahkan entri ke riwayat kosong/undefined', () => {
        const h = appendWaTemplateHistory(undefined, { action: 'submitted', status: 'PENDING', note: 'x' });
        expect(h).toHaveLength(1);
        expect(h[0]).toMatchObject({ action: 'submitted', status: 'PENDING', note: 'x' });
        expect(h[0].at instanceof Date).toBe(true);
    });

    it('PURE — tidak mem-mutasi array input', () => {
        const orig = appendWaTemplateHistory(undefined, { action: 'submitted', status: 'PENDING' });
        const next = appendWaTemplateHistory(orig, { action: 'status_change', status: 'APPROVED' });
        expect(orig).toHaveLength(1);
        expect(next).toHaveLength(2);
    });

    it('urut kronologis (terlama → terbaru)', () => {
        let h = appendWaTemplateHistory(undefined, { action: 'submitted', status: 'PENDING' });
        h = appendWaTemplateHistory(h, { action: 'status_change', status: 'APPROVED' });
        expect(h.map((e) => e.status)).toEqual(['PENDING', 'APPROVED']);
    });

    it('memakai tanggal `at` yang diberikan (buat seed baseline dari tanggal Meta asli)', () => {
        const at = new Date('2025-01-02T03:04:05Z');
        const h = appendWaTemplateHistory(undefined, { action: 'synced', status: 'APPROVED', at });
        expect(h[0].at).toBe(at);
    });

    it('fallback ke sekarang kalau `at` invalid', () => {
        const h = appendWaTemplateHistory(undefined, { action: 'synced', status: 'APPROVED', at: new Date('nope') });
        expect(isNaN(h[0].at.getTime())).toBe(false);
    });

    it('tidak menyertakan `note` kalau tak diberikan', () => {
        const h = appendWaTemplateHistory(undefined, { action: 'synced', status: 'APPROVED' });
        expect('note' in h[0]).toBe(false);
    });

    it('di-cap MAX_WA_TEMPLATE_HISTORY, menyimpan yang terbaru', () => {
        let h: ReturnType<typeof appendWaTemplateHistory> | undefined;
        const total = MAX_WA_TEMPLATE_HISTORY + 10;
        for (let i = 0; i < total; i++) {
            h = appendWaTemplateHistory(h, { action: 'status_change', status: 'PENDING', note: `n${i}` });
        }
        expect(h).toHaveLength(MAX_WA_TEMPLATE_HISTORY);
        expect(h![h!.length - 1].note).toBe(`n${total - 1}`);
        expect(h![0].note).toBe('n10');
    });
});

describe('parseMetaTimestamp', () => {
    it('parse epoch detik', () => {
        expect(parseMetaTimestamp(1700000000)?.getTime()).toBe(1700000000 * 1000);
    });
    it('parse epoch milidetik', () => {
        expect(parseMetaTimestamp(1700000000000)?.getTime()).toBe(1700000000000);
    });
    it('parse string angka (detik)', () => {
        expect(parseMetaTimestamp('1700000000')?.getTime()).toBe(1700000000 * 1000);
    });
    it('parse ISO string', () => {
        expect(parseMetaTimestamp('2025-01-02T03:04:05Z')?.toISOString()).toBe('2025-01-02T03:04:05.000Z');
    });
    it('parse "YYYY-MM-DD HH:mm:ss" (pemisah spasi ala BalesOtomatis)', () => {
        const d = parseMetaTimestamp('2025-01-02 03:04:05');
        expect(d).not.toBeNull();
        expect(isNaN((d as Date).getTime())).toBe(false);
    });
    it('balikin null untuk kosong/sampah/null/undefined', () => {
        expect(parseMetaTimestamp('')).toBeNull();
        expect(parseMetaTimestamp('   ')).toBeNull();
        expect(parseMetaTimestamp('not a date')).toBeNull();
        expect(parseMetaTimestamp(null)).toBeNull();
        expect(parseMetaTimestamp(undefined)).toBeNull();
    });
});
