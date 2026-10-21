import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next.js injects inline scripts for hydration → script-src needs
// 'unsafe-inline' (and 'unsafe-eval' in dev for HMR). script-src-attr 'none'
// still blocks inline event-handler attributes (onerror=, onclick=…), which
// React never renders, so injected markup can't run handlers even if
// sanitization ever slips. Supabase is called from the browser (blog pages
// use the anon client), so connect-src allows *.supabase.co. Fonts are
// self-hosted (next/font), so no third-party font origins are needed.
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
];

// API responses can carry drafts, analytics, or session cookies: never let a
// browser or CDN cache them, and keep them out of search indexes.
const apiHeaders = [
    { key: "Cache-Control", value: "no-store, max-age=0" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

// Admin pages render nothing useful without a session, but shouldn't be indexed.
const noIndexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
    poweredByHeader: false,
    turbopack: {
        rules: {
            "*.pdf": {
                loaders: ["file-loader"],
                as: "*.js",
            },
        },
    },
    webpack(config) {
        config.module.rules.push({
            test: /\.pdf$/,
            type: "asset/resource",
        });
        return config;
    },
    allowedDevOrigins: ["10.0.0.183"],
    async headers() {
        return [
            { source: "/:path*", headers: securityHeaders },
            { source: "/api/:path*", headers: apiHeaders },
            { source: "/studio/:path*", headers: noIndexHeaders },
            { source: "/logistics/:path*", headers: noIndexHeaders },
        ];
    },
};

module.exports = nextConfig;
