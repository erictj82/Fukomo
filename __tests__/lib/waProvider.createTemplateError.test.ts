import { describe, it, expect } from 'vitest';
import { extractMetaErrorMessage } from '@/lib/waProvider';

describe('extractMetaErrorMessage', () => {
    it('ambil error Meta Graph yg nested di fb_response.error (user_title/user_msg/message)', () => {
        const data = {
            fb_response: {
                error: {
                    message: 'Template Name Already Exists',
                    error_user_title: 'Duplikat',
                    error_user_msg: 'Template dengan nama ini sudah ada.',
                },
            },
        };
        const msg = extractMetaErrorMessage(data);
        expect(msg).toContain('Duplikat');
        expect(msg).toContain('sudah ada');
        expect(msg).toContain('Already Exists');
    });

    it('dukung variasi fb_response.data.error', () => {
        const data = { fb_response: { data: { error: { message: 'Invalid parameter' } } } };
        expect(extractMetaErrorMessage(data)).toBe('Invalid parameter');
    });

    it('fb_response.error berupa string', () => {
        expect(extractMetaErrorMessage({ fb_response: { error: 'boom' } })).toBe('boom');
    });

    it('dedup bagian yg identik biar gak dobel', () => {
        const data = { fb_response: { error: { error_user_msg: 'sama', message: 'sama' } } };
        expect(extractMetaErrorMessage(data)).toBe('sama');
    });

    it('field langsung data.message', () => {
        expect(extractMetaErrorMessage({ message: 'kredensial salah' })).toBe('kredensial salah');
    });

    it('field langsung data.error', () => {
        expect(extractMetaErrorMessage({ error: 'akses ditolak' })).toBe('akses ditolak');
    });

    it('data.errors berupa map field→[pesan] di-flatten', () => {
        const data = { errors: { name: ['wajib diisi'], body: ['terlalu panjang'] } };
        const msg = extractMetaErrorMessage(data);
        expect(msg).toContain('wajib diisi');
        expect(msg).toContain('terlalu panjang');
    });

    it('data.errors berupa array string', () => {
        expect(extractMetaErrorMessage({ errors: ['a', 'b'] })).toBe('a; b');
    });

    it('data.errors berupa array objek {message}', () => {
        expect(extractMetaErrorMessage({ errors: [{ message: 'x' }, { message: 'y' }] })).toBe('x; y');
    });

    it('fb_response sukses (tanpa error) tidak dianggap pesan error', () => {
        // fb_response valid = sukses; extractor cuma dipanggil di jalur gagal, tapi harus balik ''
        expect(extractMetaErrorMessage({ fb_response: { id: '123', status: 'PENDING' } })).toBe('');
    });

    it('balik "" untuk kosong / bukan objek / tanpa petunjuk', () => {
        expect(extractMetaErrorMessage(null)).toBe('');
        expect(extractMetaErrorMessage(undefined)).toBe('');
        expect(extractMetaErrorMessage('teks')).toBe('');
        expect(extractMetaErrorMessage({})).toBe('');
        expect(extractMetaErrorMessage({ foo: 'bar' })).toBe('');
    });
});
