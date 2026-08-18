"use client";

import { useRouter, useParams } from 'next/navigation';
import { resolveTenantFromHost } from '@/lib/tenantHost';

export function useTenantRouter() {
    const router = useRouter();
    const params = useParams();
    const slug = params?.slug as string;

    const prependSlug = (url: string) => {
        // ── [SUBDOMAIN] dual-mode + kill-switch ──────────────────────────────
        // Di mode subdomain (pusat.fukomo.com), HOST sudah bawa identitas tenant
        // → JANGAN prepend /slug, cukup path bersih ('/dashboard'), proxy.ts yang
        // rewrite internal ke /[slug]/... . Dicek di call-time (window pasti ada
        // saat user klik navigasi). NEXT_PUBLIC_TENANT_BASE_DOMAIN di-inline saat
        // build; kalau kosong → resolve null → JATUH ke perilaku path lama di
        // bawah (prepend /slug), byte-identik buat tenant existing.
        if (typeof window !== 'undefined') {
            const subdomainSlug = resolveTenantFromHost(
                window.location.hostname,
                process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN,
            );
            if (subdomainSlug) return url;
        }
        if (url.startsWith('/') && slug) {
            return `/${slug}${url}`;
        }
        return url;
    };

    return {
        ...router,
        push: (href: string, options?: any) => router.push(prependSlug(href), options),
        replace: (href: string, options?: any) => router.replace(prependSlug(href), options),
        prefetch: (href: string) => router.prefetch(prependSlug(href)),
    };
}
