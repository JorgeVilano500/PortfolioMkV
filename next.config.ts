import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * This project's Supabase origin, from NEXT_PUBLIC_SUPABASE_URL. Not
 * *.supabase.co: with a wildcard, script that slipped past sanitization could
 * send data to any Supabase project — an attacker's included. Unset or
 * malformed → '' and the browser can only reach this site (fail closed).
 */
function supabaseOrigin(): string {
    try {
        const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
        if (url.protocol === "https:" || (isDev && url.protocol === "http:")) return url.origin;
    } catch {}
    return "";
}

// Next.js injects inline scripts for hydration → script-src needs
// 'unsafe-inline' (and 'unsafe-eval' in dev for HMR). script-src-attr 'none'
// still blocks inline event-handler attributes (onerror=, onclick=…), which
// React never renders, so injected markup can't run handlers even if
// sanitization ever slips. Supabase is called from the browser (blog pages
// use the anon client), so connect-src allows this project's origin only.
// Fonts are self-hosted (next/font), so no third-party font origins are needed.
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${supabaseOrigin() ? ` ${supabaseOrigin()}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
].join("; ");

// Powerful browser features the site never uses — denied for this page and
// every frame it could embed, so injected script can't prompt for them.
// Clipboard and fullscreen stay allowed (copy-link button, media).
const permissionsPolicy = [
    "accelerometer", "browsing-topics", "camera", "display-capture", "geolocation",
    "gyroscope", "hid", "idle-detection", "magnetometer", "microphone", "midi",
    "payment", "screen-wake-lock", "serial", "usb", "xr-spatial-tracking",
].map((feature) => `${feature}=()`).join(", ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Legacy Flash/PDF readers: never load cross-domain policy files from here.
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
];

// API responses can carry drafts, analytics, or session cookies: never let a
// browser or CDN cache them, and keep them out of search indexes.
// CORP same-origin stops another site from pulling a response into its own
// process with <script>/<img> (Spectre-style side channels); our own pages
// fetch same-origin, and server-to-server callers ignore it.
const apiHeaders = [
    { key: "Cache-Control", value: "no-store, max-age=0" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

// Admin pages render nothing useful without a session, but shouldn't be indexed.
const noIndexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
    poweredByHeader: false,
    experimental: {
        // Next 16.3 caches Turbopack's build work in .next/cache/turbopack by
        // default, and that cache stores the values of env vars read during the
        // build (RESEND_API_KEY, secrets…). Netlify's secrets scan then finds them
        // and fails the deploy. Keep secrets off disk instead of exempting the
        // cache from scanning; builds behave as they did before 16.3.
        turbopackFileSystemCacheForBuild: false,
    },
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
