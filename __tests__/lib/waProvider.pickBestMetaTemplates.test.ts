import { describe, it, expect } from 'vitest';
import { normalizeMetaTemplateStatus, pickBestMetaTemplates } from '@/lib/waProvider';

// Regresi konsistensi status template WABA (bug pusat 2026-08-21): Meta/BSP mengembalikan
// DUA entri untuk template_name yang sama — satu DRAFT tanpa id + satu APPROVED dengan id.
// Reconcile lama "pakai entri terakhir" bisa menurunkan APPROVED -> PENDING (tergantung urutan),
// bikin template yang sebenarnya bisa dikirim malah kesembunyi dari dropdown assignable.
describe('normalizeMetaTemplateStatus', () => {
    it('memetakan varian APPROVED/ACTIVE -> APPROVED', () => {
        for (const s of ['APPROVED', 'approved', 'Approved', 'ACTIVE']) {
            expect(normalizeMetaTemplateStatus(s)).toBe('APPROVED');
        }
    });

    it('memetakan REJECTED/DISABLED/PAUSED/DELETED -> REJECTED', () => {
        for (const s of ['REJECTED', 'DISABLED', 'PAUSED', 'DELETED', 'PENDING_DELETION']) {
            expect(normalizeMetaTemplateStatus(s)).toBe('REJECTED');
        }
    });

    it('memetakan sisanya (PENDING/IN_REVIEW/IN_APPEAL/DRAFT/kosong/unknown) -> PENDING', () => {
        for (const s of ['PENDING', 'IN_REVIEW', 'IN_APPEAL', 'DRAFT', 'FLAGGED', 'LIMIT_EXCEEDED', '', undefined, null, 'wat']) {
            expect(normalizeMetaTemplateStatus(s)).toBe('PENDING');
        }
    });
});

describe('pickBestMetaTemplates', () => {
    it('APPROVED+id menang atas duplikat DRAFT — TANPA peduli urutan', () => {
        const draftFirst = pickBestMetaTemplates([
            { template_name: 'fu_ke1_coloring', template_status: 'DRAFT' },
            { template_name: 'fu_ke1_coloring', template_status: 'APPROVED', templateId: '1077487955233068' },
        ]);
        const draftLast = pickBestMetaTemplates([
            { template_name: 'fu_ke1_coloring', template_status: 'APPROVED', templateId: '1077487955233068' },
            { template_name: 'fu_ke1_coloring', template_status: 'DRAFT' },
        ]);
        for (const best of [draftFirst, draftLast]) {
            expect(best.get('fu_ke1_coloring')).toMatchObject({ status: 'APPROVED', templateId: '1077487955233068' });
        }
    });

    it('APPROVED+id menang atas APPROVED tanpa id (yang benar-benar bisa dikirim)', () => {
        const best = pickBestMetaTemplates([
            { template_name: 't', template_status: 'APPROVED' },
            { template_name: 't', template_status: 'APPROVED', templateId: '999' },
        ]);
        expect(best.get('t')).toMatchObject({ status: 'APPROVED', templateId: '999' });
    });

    it('meng-key dengan nama ternormalisasi (trim + lowercase) & id selalu string', () => {
        const best = pickBestMetaTemplates([
            { template_name: '  Ucapan_Terima_Kasih  ', template_status: 'APPROVED', templateId: 1027996053304714 },
        ]);
        const hit = best.get('ucapan_terima_kasih');
        expect(hit?.status).toBe('APPROVED');
        expect(hit?.templateId).toBe('1027996053304714');
    });

    it('mengabaikan entri tanpa nama & input non-array', () => {
        expect(pickBestMetaTemplates([{ template_status: 'APPROVED' }, { template_name: '   ' }]).size).toBe(0);
        expect(pickBestMetaTemplates(undefined as any).size).toBe(0);
        expect(pickBestMetaTemplates(null as any).size).toBe(0);
    });

    it('PENDING tidak menaikkan yang REJECTED tapi kalah dari APPROVED (ranking sendability)', () => {
        const best = pickBestMetaTemplates([
            { template_name: 'x', template_status: 'REJECTED' },
            { template_name: 'x', template_status: 'PENDING' },
        ]);
        expect(best.get('x')?.status).toBe('PENDING');
    });

    it('menangkap body dari template_content (BalesOtomatis) untuk entri terbaik', () => {
        const best = pickBestMetaTemplates([
            { template_name: 'fu', template_status: 'DRAFT', template_content: 'draft body' },
            { template_name: 'fu', template_status: 'APPROVED', templateId: '77', template_content: 'Halo Kak {{1}}, hasil {{2}}' },
        ]);
        expect(best.get('fu')).toMatchObject({ status: 'APPROVED', templateId: '77', content: 'Halo Kak {{1}}, hasil {{2}}' });
    });

    it('mengabaikan template_id base64 (token berubah) — hanya templateId numerik yang dipakai', () => {
        const best = pickBestMetaTemplates([
            { template_name: 'y', template_status: 'APPROVED', template_id: 'Tmt1Q1JoM1p3QVVT', template_content: 'body' },
        ]);
        // status APPROVED tapi tanpa id numerik sejati -> templateId null (tak dianggap sendable-with-id)
        expect(best.get('y')).toMatchObject({ status: 'APPROVED', templateId: null });
    });
});
