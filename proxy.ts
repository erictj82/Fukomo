import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
    const requestHeaders = new Headers(req.headers);
    
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
