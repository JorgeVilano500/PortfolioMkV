"use client"

import { useOnboarding } from "./OnboardingProvider"

/** Buttons on /privacy that open the same settings dialog as the footer link. */
export function PrivacyActions() {
    const { openSettings, consent, ready } = useOnboarding()
    return (
        <div className="flex flex-wrap items-center gap-3">
            <button
                type="button"
                onClick={openSettings}
                className="bg-[#7c6dff] hover:bg-[#6a5de8] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
            >
                Manage cookie settings
            </button>
            {ready && (
                <p className="text-xs text-[#8a88a0]" role="status">
                    {consent
                        ? `Your current choice: analytics ${consent.analytics ? "on" : "off"}.`
                        : "You haven't made a choice yet, so analytics are off."}
                </p>
            )}
        </div>
    )
}
