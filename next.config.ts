import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["187.52.127.54"],

  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://187.52.127.54:3001 http://187.52.127.54:3002 ws://187.52.127.54:3001 ws://187.52.127.54:3002 http://127.0.0.1:3002 ws://127.0.0.1:3002 https://api.openai.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
