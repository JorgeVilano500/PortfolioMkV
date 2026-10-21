/**
 * Tiny user-agent summarizer for the Logistics dashboard. Deliberately coarse
 * (browser family + OS) — no dependency, no fingerprinting detail.
 */

export type UaSummary = { browser: string; os: string }

const BROWSERS: [RegExp, string][] = [
    [/\bEdg(?:e|A|iOS)?\//, "Edge"],
    [/\b(?:OPR|Opera)\//, "Opera"],
    [/\bSamsungBrowser\//, "Samsung Internet"],
    [/\b(?:Firefox|FxiOS)\//, "Firefox"],
    [/\b(?:Chrome|CriOS)\//, "Chrome"],
    [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
    [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
    [/\bAndroid\b/, "Android"],
    [/\bWindows NT\b/, "Windows"],
    [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
    [/\bCrOS\b/, "ChromeOS"],
    [/\bLinux\b/, "Linux"],
]

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse/i

export function summarizeUserAgent(ua: string | null | undefined): UaSummary {
    if (!ua) return { browser: "Unknown", os: "Unknown" }
    if (BOT_RE.test(ua)) return { browser: "Bot", os: "—" }
    const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "Other"
    const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? "Other"
    return { browser, os }
}
