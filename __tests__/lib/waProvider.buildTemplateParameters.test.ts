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

// Placeholder BERNOMOR ({{1}},{{2}}) — dipakai template yg dibuat langsung di dashboard Meta/BSP
// (mis. pusat: "Halo Kak {{1}}, ... hasil coloring {{2}}"). Tak ada nama variabel, jadi harus diisi
// POSISIONAL: {{1}}=nama customer, {{2}}=service, {{3}}=toko, {{4}}=tanggal. Ini bug pusat 2026-08-22:
// row stub hasil sync tak punya metaVariables → 0 param → follow-up gagal/kosong.
describe('buildTemplateParameters — placeholder bernomor (template dashboard Meta)', () => {
    const ctx = {
        customerName: 'Andi',
        storeName: 'Salon Fukomo',
        date: '22 Agustus 2026',
        serviceName: 'Coloring',
    };

    it('mengisi {{1}},{{2}} posisional ke nama customer & service', () => {
        expect(buildTemplateParameters(['1', '2'], {}, ctx).map((p) => p.text)).toEqual(['Andi', 'Coloring']);
    });

    it('template 1 variabel: {{1}} = nama customer', () => {
        expect(buildTemplateParameters(['1'], {}, ctx)[0].text).toBe('Andi');
    });

    it('posisi 3 & 4 = toko & tanggal, posisi di luar jangkauan = string kosong', () => {
        expect(buildTemplateParameters(['3'], {}, ctx)[0].text).toBe('Salon Fukomo');
        expect(buildTemplateParameters(['4'], {}, ctx)[0].text).toBe('22 Agustus 2026');
        expect(buildTemplateParameters(['5'], {}, ctx)[0].text).toBe('');
    });

    it('kasus persis pusat: body bernomor -> extractTemplateVariables -> params terisi', () => {
        const body = 'Halo Kak {{1}}, mau follow up hasil coloring {{2}} kemarin yaa';
        const vars = extractTemplateVariables(body);
        expect(vars).toEqual(['1', '2']);
        expect(buildTemplateParameters(vars, {}, ctx).map((p) => p.text)).toEqual(['Andi', 'Coloring']);
    });

    it('nilai eksplisit (campaign) tetap menang atas fallback posisional', () => {
        expect(buildTemplateParameters(['1'], { '1': 'KODE123' }, ctx)[0].text).toBe('KODE123');
    });

    it('default aman saat ctx kosong (Pelanggan/Layanan)', () => {
        expect(buildTemplateParameters(['1', '2'], {}, {}).map((p) => p.text)).toEqual(['Pelanggan', 'Layanan']);
    });
});
