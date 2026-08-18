import { describe, it, expect } from 'vitest';
import { resolveTenantFromHost } from '@/lib/tenantHost';

const BASE = 'fukomo.com';

describe('resolveTenantFromHost — kill-switch (baseDomain kosong)', () => {
    it('return null kalau baseDomain undefined (mode subdomain mati)', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', undefined)).toBeNull();
    });
    it('return null kalau baseDomain null', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', null)).toBeNull();
    });
    it('return null kalau baseDomain string kosong', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', '')).toBeNull();
    });
});

describe('resolveTenantFromHost — host kosong / invalid', () => {
    it('return null kalau host null', () => {
        expect(resolveTenantFromHost(null, BASE)).toBeNull();
    });
    it('return null kalau host undefined', () => {
        expect(resolveTenantFromHost(undefined, BASE)).toBeNull();
    });
    it('return null kalau host string kosong', () => {
        expect(resolveTenantFromHost('', BASE)).toBeNull();
    });
});

describe('resolveTenantFromHost — apex & www (bukan tenant)', () => {
    it('apex fukomo.com → null', () => {
        expect(resolveTenantFromHost('fukomo.com', BASE)).toBeNull();
    });
    it('apex dengan port → null', () => {
        expect(resolveTenantFromHost('fukomo.com:3000', BASE)).toBeNull();
    });
    it('www.fukomo.com → null (reserved)', () => {
        expect(resolveTenantFromHost('www.fukomo.com', BASE)).toBeNull();
    });
});

describe('resolveTenantFromHost — reserved subdomains', () => {
    it('adminsaas.fukomo.com → null (panel PHP terpisah)', () => {
        expect(resolveTenantFromHost('adminsaas.fukomo.com', BASE)).toBeNull();
    });
    it('api.fukomo.com → null', () => {
        expect(resolveTenantFromHost('api.fukomo.com', BASE)).toBeNull();
    });
    it('admin.fukomo.com → null', () => {
        expect(resolveTenantFromHost('admin.fukomo.com', BASE)).toBeNull();
    });
    it('app.fukomo.com → null', () => {
        expect(resolveTenantFromHost('app.fukomo.com', BASE)).toBeNull();
    });
});

describe('resolveTenantFromHost — tenant valid', () => {
    it('pusat.fukomo.com → "pusat"', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', BASE)).toBe('pusat');
    });
    it('bintaro.fukomo.com → "bintaro"', () => {
        expect(resolveTenantFromHost('bintaro.fukomo.com', BASE)).toBe('bintaro');
    });
    it('slug dengan dash: my-salon.fukomo.com → "my-salon"', () => {
        expect(resolveTenantFromHost('my-salon.fukomo.com', BASE)).toBe('my-salon');
    });
    it('slug dengan angka: cabang01.fukomo.com → "cabang01"', () => {
        expect(resolveTenantFromHost('cabang01.fukomo.com', BASE)).toBe('cabang01');
    });
});

describe('resolveTenantFromHost — normalisasi (port + case)', () => {
    it('buang port: pusat.fukomo.com:3000 → "pusat"', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com:3000', BASE)).toBe('pusat');
    });
    it('lowercase: PUSAT.Fukomo.COM → "pusat"', () => {
        expect(resolveTenantFromHost('PUSAT.Fukomo.COM', BASE)).toBe('pusat');
    });
    it('baseDomain uppercase juga dinormalisasi', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', 'FUKOMO.COM')).toBe('pusat');
    });
    it('baseDomain dengan leading dot ".fukomo.com" tetap jalan', () => {
        expect(resolveTenantFromHost('pusat.fukomo.com', '.fukomo.com')).toBe('pusat');
    });
});

describe('resolveTenantFromHost — domain lain / multi-level (null)', () => {
    it('domain lain sama sekali → null', () => {
        expect(resolveTenantFromHost('pusat.example.com', BASE)).toBeNull();
    });
    it('multi-level a.b.fukomo.com → null (bukan tenant simpel)', () => {
        expect(resolveTenantFromHost('a.b.fukomo.com', BASE)).toBeNull();
    });
    it('host yang cuma "mirip" suffix tanpa dot → null (evilfukomo.com)', () => {
        expect(resolveTenantFromHost('evilfukomo.com', BASE)).toBeNull();
    });
    it('suffix di tengah tapi bukan akhir → null', () => {
        expect(resolveTenantFromHost('fukomo.com.evil.com', BASE)).toBeNull();
    });
});

describe('resolveTenantFromHost — label invalid', () => {
    it('label diakhiri dash → null', () => {
        expect(resolveTenantFromHost('bad-.fukomo.com', BASE)).toBeNull();
    });
    it('label diawali dash → null', () => {
        expect(resolveTenantFromHost('-bad.fukomo.com', BASE)).toBeNull();
    });
    it('label dengan underscore → null', () => {
        expect(resolveTenantFromHost('bad_slug.fukomo.com', BASE)).toBeNull();
    });
    it('label dengan spasi → null', () => {
        expect(resolveTenantFromHost('bad slug.fukomo.com', BASE)).toBeNull();
    });
    it('label satu huruf tetap valid: a.fukomo.com → "a"', () => {
        expect(resolveTenantFromHost('a.fukomo.com', BASE)).toBe('a');
    });
});
