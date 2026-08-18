import { describe, it, expect } from 'vitest';
import { buildTemplateParameters, extractTemplateVariables } from '@/lib/waProvider';

// Menjaga migrasi follow-up ke WABA: template follow-up memakai token {{nama_service}}.
// buildTemplateParameters harus meresolusi token itu (embedded & by-name fallback) plus alias.
describe('buildTemplateParameters — dukungan nama_service (follow-up WABA)', () => {
    const ctx = {
        customerName: 'Andi',
        storeName: 'Salon Fukomo',
        date: '18 Agustus 2026',
        serviceName: 'Korean Glass Skin',
    };

    it('meresolusi token {{nama_service}} yang ditulis di dalam nilai eksplisit', () => {
        const params = buildTemplateParameters(
            ['pesan'],
            { pesan: 'Halo {{nama_customer}}, gimana hasil {{nama_service}}?' },
            ctx,
        );
        expect(params).toEqual([
            { type: 'text', text: 'Halo Andi, gimana hasil Korean Glass Skin?' },
        ]);
    });

    it('fallback by-nama-variabel untuk nama_service saat values kosong (kasus follow-up)', () => {
        const params = buildTemplateParameters(['nama_customer', 'nama_service'], {}, ctx);
        expect(params).toEqual([
            { type: 'text', text: 'Andi' },
            { type: 'text', text: 'Korean Glass Skin' },
        ]);
    });

    it('mendukung alias service_name / layanan / servicename lewat by-name fallback', () => {
        expect(buildTemplateParameters(['service_name'], {}, ctx)[0].text).toBe('Korean Glass Skin');
        expect(buildTemplateParameters(['servicename'], {}, ctx)[0].text).toBe('Korean Glass Skin');
        expect(buildTemplateParameters(['layanan'], {}, ctx)[0].text).toBe('Korean Glass Skin');
    });

    it('default ke "Layanan" saat ctx.serviceName tidak ada', () => {
        const params = buildTemplateParameters(['nama_service'], {}, { customerName: 'Budi' });
        expect(params[0].text).toBe('Layanan');
    });

    it('tidak mengganggu resolusi token lama (customer/store/date)', () => {
        const params = buildTemplateParameters(
            ['a'],
            { a: '{{nama_customer}} di {{nama_toko}} pada {{tanggal}}' },
            ctx,
        );
        expect(params[0].text).toBe('Andi di Salon Fukomo pada 18 Agustus 2026');
    });

    it('terintegrasi dengan extractTemplateVariables (urutan variabel dari message)', () => {
        const msg = 'Hai {{nama_customer}}, terima kasih sudah {{nama_service}} di {{nama_toko}}';
        const vars = extractTemplateVariables(msg);
        expect(vars).toEqual(['nama_customer', 'nama_service', 'nama_toko']);

        const params = buildTemplateParameters(vars, {}, ctx);
        expect(params.map((p) => p.text)).toEqual(['Andi', 'Korean Glass Skin', 'Salon Fukomo']);
    });
});
