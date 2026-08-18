import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import { resolveTenantFromHost } from "./lib/tenantHost";

const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
    const requestHeaders = new Headers(req.headers);

    // ── [SUBDOMAIN] Mode subdomain per-tenant (pusat.fukomo.com/...) ──────────
    // DUAL-MODE + KILL-SWITCH: cuma aktif kalau TENANT_BASE_DOMAIN di-set.
    // Kalau env kosong → subdomainSlug selalu null → SKIP blok ini → jalan
    // persis logika path-based lama di bawah (nol perubahan buat tenant existing).
    //
    // Di mode subdomain, HOST adalah sumber kebenaran identitas tenant — meng-
    // override x-store-slug apa pun yang dikirim client (mencegah halaman
    // subdomain-A nembak API tenant-B lewat header palsu).
    const baseDomain = process.env.TENANT_BASE_DOMAIN;
    const subdomainSlug = resolveTenantFromHost(req.headers.get('host'), baseDomain);
    if (subdomainSlug) {
        requestHeaders.set('x-store-slug', subdomainSlug);

        const pathname = req.nextUrl.pathname;
        const isApi = pathname === '/api' || pathname.startsWith('/api/');
        // Path yang udah ke-prefix slug (mis. karena link lama yang masih nempel
        // /pusat/...) dibiarkan apa adanya biar gak jadi /pusat/pusat/...
        const alreadyPrefixed =
            pathname === `/${subdomainSlug}` || pathname.startsWith(`/${subdomainSlug}/`);

        // Halaman (bukan API) yang slug-less → rewrite internal ke /[slug]/...
        // supaya routing app/[slug]/ + params.slug tetap resolve, TAPI URL di
        // browser tetap bersih (pusat.fukomo.com/dashboard). API tetap di /api/*.
        if (!isApi && !alreadyPrefixed) {
            const url = req.nextUrl.clone();
            url.pathname = `/${subdomainSlug}${pathname === '/' ? '' : pathname}`;
            return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
        }

        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // If x-store-slug is already explicitly set by the client, don't overwrite it
    const existingSlug = req.headers.get('x-store-slug');
    if (existingSlug) {
        return NextResponse.next({
            request: { headers: requestHeaders }
        });
    }

    // 1. Try to get slug from session
    if ((req.auth?.user as any)?.tenantSlug) {
        requestHeaders.set('x-store-slug', (req.auth!.user as any).tenantSlug);
    } else {
        // 2. Try to get slug from URL path (if it's a direct page visit like /[slug]/login)
        const pathParts = req.nextUrl.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0 && pathParts[0] !== 'api' && pathParts[0] !== 'admin' && pathParts[0] !== 'register' && pathParts[0] !== 'login') {
             requestHeaders.set('x-store-slug', pathParts[0]);
        } else {
            // 3. Try to get slug from Referer (for API calls made from the browser)
            const referer = req.headers.get('referer');
            if (referer) {
                try {
                    const url = new URL(referer);
                    const refererPathParts = url.pathname.split('/').filter(Boolean);
                    if (refererPathParts.length > 0 && refererPathParts[0] !== 'api' && refererPathParts[0] !== 'admin' && refererPathParts[0] !== 'register' && refererPathParts[0] !== 'login') {
                        requestHeaders.set('x-store-slug', refererPathParts[0]);
                    }
                } catch (e) {}
            }
        }
    }

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        }
    });
});

export const config = {
    matcher: ["/((?!api/auth|api/fonnte/webhook|api/wa/trigger|api/wa/greeting-logs|_next/static|_next/image|favicon.ico).*)"],
};
