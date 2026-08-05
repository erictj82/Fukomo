import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    session: {
        strategy: "jwt",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const pathParts = nextUrl.pathname.split('/').filter(Boolean);
            // pathParts[0] could be a slug like "pusat", "bintaro", or "api"
            const isApiRoute = pathParts[0] === 'api';
            const nonSlugSegments = ['api', 'admin', 'register', 'login', 'setup'];
            const slugSegment = pathParts[0] && !nonSlugSegments.includes(pathParts[0]) ? pathParts[0] : null;
            // The "page" part is the path after the slug, e.g. /pusat/login -> "login"
            const pageSegment = slugSegment ? pathParts.slice(1).join('/') : pathParts.join('/');

            const isRootOrRegister = nextUrl.pathname === '/' || nextUrl.pathname === '/register';

            const isPublicPage =
                isRootOrRegister ||
                pageSegment === 'login' ||
                pageSegment === 'register' ||
                pageSegment === 'setup' ||
                pageSegment.startsWith('r/') ||
                pageSegment.startsWith('portal/') ||
                nextUrl.pathname.startsWith('/admin');

            const isPublicApi =
                nextUrl.pathname === '/api/setup' ||
                nextUrl.pathname === '/api/register' ||
                nextUrl.pathname === '/api/settings' ||
                nextUrl.pathname === '/api/payments/xendit/webhook' ||
                // Cron SaaS dipanggil terjadwal dari luar (crontab) via Bearer CRON_SECRET,
                // bukan session NextAuth — harus di-exempt biar gak kena redirect 302.
                // Auth aslinya = cek CRON_SECRET di handler. Sengaja cuma path INI, bukan
                // /api/cron/* umum: sebagian cron existing gak punya guard CRON_SECRET,
                // exempt rame-rame malah buka mereka tanpa auth.
                nextUrl.pathname === '/api/cron/subscription-expiry' ||
                nextUrl.pathname.startsWith('/api/auth') ||
                nextUrl.pathname.startsWith('/api/public') ||
                nextUrl.pathname.startsWith('/api/admin') ||
                // /api/internal/* dipanggil server-to-server oleh panel SaaS (PHP) —
                // TANPA session NextAuth, cuma bawa header x-internal-api-key. Kalau gak
                // di-exempt di sini, middleware nge-redirect 302 ke /pusat/login sebelum
                // sampai ke route handler. Otentikasi asli endpoint ini = requireInternalApiKey()
                // (fail-closed 503 kalau key belum di-set, 401 kalau salah), BUKAN session.
                nextUrl.pathname.startsWith('/api/internal') ||
                nextUrl.pathname.startsWith('/api/customers/portal');

            const isPublicRoute = isPublicPage || isPublicApi;

            // Redirect /login to /pusat/login
            if (pageSegment === 'login' && !slugSegment) {
                return Response.redirect(new URL('/pusat/login', nextUrl));
            }

            // Redirect logic
            if (!isLoggedIn && !isPublicRoute) {
                // Redirect to /{slug}/login if slug is known, otherwise /pusat/login
                const loginSlug = slugSegment || 'pusat';
                return Response.redirect(new URL(`/${loginSlug}/login`, nextUrl));
            }

            if (isLoggedIn && !isPublicRoute && slugSegment) {
                const userSlug = (auth?.user as any)?.tenantSlug;
                // Block cross-tenant access to protected pages
                if (userSlug && slugSegment !== userSlug) {
                    return Response.redirect(new URL(`/${userSlug}/dashboard`, nextUrl));
                }

                // Subscription expiry check (blueprint section 4) — block akses walau
                // JWT masih valid kalau langganan toko udah habis/suspended. Data ini
                // di-embed ke token pas sign-in & refresh 5-menitan di auth.ts (Node
                // runtime, lihat getSubscriptionCacheForSlug) - DILARANG query DB
                // langsung di sini karena authorized() ini jalan di Edge runtime
                // (proxy.ts pakai NextAuth(authConfig) tanpa provider/DB access).
                //
                // status null = tenant belum pernah di-assign subscription plan
                // (misal toko lama sebelum sistem SaaS ini ada) - sengaja TIDAK
                // diblokir, biar gak nge-lockout toko existing yang belum migrasi.
                // Kill-switch: kalau SAAS_ENABLED != 'true', fitur SaaS mati total
                // -> JANGAN pernah blok akses karena status langganan. Env dibaca
                // langsung di sini (Edge runtime, gak boleh import subscriptionEnforcement
                // yang pakai mongoose). Nilai di-inline saat build; ganti flag = rebuild.
                const saasEnabled = process.env.SAAS_ENABLED === 'true';
                const subscriptionStatus = (auth?.user as any)?.subscriptionStatus;
                const subscriptionExpiresAt = (auth?.user as any)?.subscriptionExpiresAt;
                const isSubscriptionBlocked =
                    saasEnabled && (
                        subscriptionStatus === 'expired' ||
                        subscriptionStatus === 'suspended' ||
                        (!!subscriptionExpiresAt && new Date(subscriptionExpiresAt).getTime() < Date.now())
                    );

                if (isSubscriptionBlocked && pageSegment !== 'subscription-expired') {
                    return Response.redirect(new URL(`/${slugSegment}/subscription-expired`, nextUrl));
                }
            }

            if (isLoggedIn && (isRootOrRegister || pageSegment === 'login' || pageSegment === 'register')) {
                const userSlug = (auth?.user as any)?.tenantSlug || 'pusat';
                return Response.redirect(new URL(`/${userSlug}/dashboard`, nextUrl));
            }

            return true;
        },
        async jwt({ token, user }) {
            // Hanya set token saat initial sign-in.
            // Permission refresh via DB dilakukan di auth.ts (Node.js runtime)
            // yang bisa menggunakan mongoose langsung — tanpa HTTP round-trip.
            if (user) {
                token.id = user.id;
                token.tenantSlug = (user as any).tenantSlug;
                if (user.role) {
                    token.role = user.role.name;
                    token.permissions = user.role.permissions;
                    token.roleId = user.role._id?.toString() || user.role.id;
                }
            }

            return token;
        },
        async session({ session, token }: any) {
            if (session.user) {
                session.user.id = token.id;
                session.user.role = token.role;
                session.user.permissions = token.permissions;
                session.user.tenantSlug = token.tenantSlug;
                session.user.subscriptionStatus = token.subscriptionStatus ?? null;
                session.user.subscriptionExpiresAt = token.subscriptionExpiresAt ?? null;
            }
            return session;
        },
    },
    providers: [], // Providers are added in auth.ts
} satisfies NextAuthConfig;