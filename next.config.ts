import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next.js injects inline scripts for hydration → script-src needs
// 'unsafe-inline' (and 'unsafe-eval' in dev for HMR). Google Fonts is loaded
// via <link> in app/layout.tsx. Supabase is called from the browser (blog
// pages use the anon client), so connect-src allows *.supabase.co.
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
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
    { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
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
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

module.exports = nextConfig;
