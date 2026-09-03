import { NextRequest, NextResponse } from 'next/server';
import { checkPermissionWithSession } from '@/lib/rbac';
import { getBalesOtomatisInfo, testBalesOtomatisWaba } from '@/lib/waProvider';
import { extractWabaPhoneFromPayload } from '@/lib/wabaBinding';

// Sengaja gak nyimpen apa-apa ke DB - ini cuma "coba dulu sebelum simpen", dipanggil
// dari halaman Settings pas user klik tombol "Test Koneksi" sebelum submit form.
export async function POST(request: NextRequest) {
    try {
        const { error: permissionError } = await checkPermissionWithSession(request, 'settings', 'edit');
        if (permissionError) return permissionError;

        const body = await request.json();
        const { mode, apiKey, secretKey, licensesKey } = body;

        if (mode === 'waba') {
            const result = await testBalesOtomatisWaba(secretKey, licensesKey);
            if (!result.success) {
                return NextResponse.json({ success: false, error: result.error }, { status: 400 });
            }
            const detectedPhone = extractWabaPhoneFromPayload({ templates: result.templates });
            return NextResponse.json({ 
                success: true, 
                message: `Koneksi WABA berhasil. Ditemukan ${result.templateCount || 0} template di Meta.`, 
                templates: result.templates || [],
                templateCount: result.templateCount || 0,
                detectedWabaPhone: detectedPhone || '',
            });
        }

        // mode 'unofficial'
        const result = await getBalesOtomatisInfo(apiKey);
        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ success: true, devices: result.devices ?? [] });
    } catch (error: any) {
        console.error('[settings/wa-provider/test-connection][POST] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
