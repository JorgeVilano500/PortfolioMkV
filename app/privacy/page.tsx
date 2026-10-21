import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components"
import { PrivacyActions } from "@/components/onboarding/PrivacyActions"
import {
    ANALYTICS_DATA_POINTS,
    CONSENT_MAX_AGE_DAYS,
    CONSENT_VERSION,
    PRIVACY_POLICY_UPDATED,
} from "@/lib/consent"

export const metadata: Metadata = {
    title: "Privacy & Cookies",
    description: "What JAVA.dev stores in your browser, what analytics collect (only if you opt in), and how to change or delete it.",
    alternates: { canonical: "/privacy" },
}

const NECESSARY_STORAGE = [
    { name: "java_consent", type: "Cookie",          purpose: "Remembers your privacy choice and a random visitor ID.", duration: `${CONSENT_MAX_AGE_DAYS} days` },
    { name: "java_consent", type: "Local storage",   purpose: "Backup of that choice for browsers that block cookies.", duration: `Honored for ${CONSENT_MAX_AGE_DAYS} days` },
    { name: "java_tour",    type: "Session storage", purpose: "Your place in the guided tour.",                          duration: "Until you close the tab" },
    { name: "admin_session", type: "Cookie",         purpose: "Keeps the site owner signed in to the admin area. Never set for visitors.", duration: "8 hours" },
]

const ANALYTICS_STORAGE = [
    { name: "_pv_sid",  type: "Session storage", purpose: "Groups the pages you view in one visit.", duration: "Until you close the tab" },
    { name: "_pv_seen", type: "Local storage",   purpose: "Tells first visits apart from return visits.", duration: "Until you clear site data" },
]

function StorageTable({ rows }: { rows: typeof NECESSARY_STORAGE }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-[#2a2840]">
            <table className="w-full text-sm text-left">
                <thead className="bg-[#1e1c2e] text-[#c4c0d8]">
                    <tr>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Name</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Type</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Purpose</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Kept for</th>
                    </tr>
                </thead>
                <tbody className="text-[#8a88a0]">
                    {rows.map((r) => (
                        <tr key={`${r.name}-${r.type}`} className="border-t border-[#1e1c2e]">
                            <td className="px-4 py-2.5 font-mono text-xs text-[#AFA9EC] whitespace-nowrap">{r.name}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{r.type}</td>
                            <td className="px-4 py-2.5">{r.purpose}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{r.duration}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 space-y-3">
            <h2 className="font-syne font-bold text-xl text-[#f0eeff]">{title}</h2>
            <div className="text-sm text-[#8a88a0] leading-relaxed space-y-3">{children}</div>
        </section>
    )
}

export default function PrivacyPage() {
    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="privacy" />

            <div className="max-w-3xl mx-auto space-y-4 pb-8">
                <header className="px-2 mb-4">
                    <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Privacy</p>
                    <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">
                        Privacy &amp; cookies
                    </h1>
                    <p className="text-sm text-[#8a88a0]">
                        Last updated {PRIVACY_POLICY_UPDATED} · Policy version {CONSENT_VERSION}
                    </p>
                </header>

                <section className="bg-[#16152a] border border-[#2a2840] rounded-2xl p-6 space-y-4">
                    <p className="text-sm text-[#e8e6f0] leading-relaxed">
                        <strong className="text-[#f0eeff]">The short version:</strong> analytics are off unless you turn them on.
                        There are no ad cookies and no third-party trackers, and nothing is sold. You can change your mind, or
                        delete what was collected, at any time.
                    </p>
                    <PrivacyActions />
                </section>

                <Section title="Who runs this site">
                    <p>
                        JAVA.dev is the personal portfolio of Jorge Alejandro Vilanova Alvarado. Questions about your data go
                        through the <Link href="/contact" className="text-[#AFA9EC] underline underline-offset-2 hover:text-[#f0eeff]">contact page</Link>.
                    </p>
                </Section>

                <Section title="Always on: strictly necessary storage">
                    <p>
                        These keep the site working and remember the choices you make. They don&apos;t track you and
                        can&apos;t be switched off.
                    </p>
                    <StorageTable rows={NECESSARY_STORAGE} />
                </Section>

                <Section title="Optional: analytics (only if you opt in)">
                    <p>If you allow analytics, each page you view records:</p>
                    <ul className="space-y-2">
                        {ANALYTICS_DATA_POINTS.map((d) => (
                            <li key={d.label} className="flex gap-2">
                                <span className="text-[#7c6dff] shrink-0" aria-hidden="true">→</span>
                                <span><span className="text-[#e8e6f0] font-medium">{d.label}.</span> {d.detail}</span>
                            </li>
                        ))}
                    </ul>
                    <p>Analytics also uses this browser storage:</p>
                    <StorageTable rows={ANALYTICS_STORAGE} />
                    <p>
                        If you decline, none of this is recorded. The server refuses to store page views unless your browser
                        carries an analytics opt-in, so turning it off is enforced on the server, not just in the page.
                    </p>
                </Section>

                <Section title="How it's used and where it's kept">
                    <p>
                        Analytics are used only to understand which pages are useful and to fix what isn&apos;t. They are
                        viewed by the site owner in a private, password-protected dashboard.
                    </p>
                    <p>
                        Records are stored in the site&apos;s own database, hosted by Supabase. The site is served by Netlify,
                        which, like any web host, processes your IP address to deliver pages.
                    </p>
                    <p>
                        When you make a choice, a small consent record is kept as proof of what you chose: a random ID, your
                        choice, the policy version, and the date. It never includes your IP address.
                    </p>
                </Section>

                <Section title="Your choices and rights">
                    <ul className="space-y-2 list-disc list-inside">
                        <li>Change your choice any time from <span className="text-[#e8e6f0]">Cookie settings</span> at the bottom of every page.</li>
                        <li>Delete the analytics recorded for this browser from the same dialog, using <span className="text-[#e8e6f0]">Delete my data</span>.</li>
                        <li>Clearing this site&apos;s data in your browser resets everything, and you&apos;ll be asked again.</li>
                        <li>
                            Depending on where you live (for example, the EU or UK), you may have the right to access, correct, or
                            erase your data, to object to processing, and to complain to your data protection authority.
                        </li>
                    </ul>
                </Section>

                <Section title="Changes to this policy">
                    <p>
                        If what is collected or why changes, the policy version goes up and you&apos;ll be asked for your choice
                        again. Your previous choice won&apos;t carry over.
                    </p>
                </Section>
            </div>
        </div>
    )
}
