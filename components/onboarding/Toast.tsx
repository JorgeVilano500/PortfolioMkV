"use client"

import { useOnboarding } from "./OnboardingProvider"

/** Small status message (e.g. "Privacy choices saved."), announced politely to screen readers. */
export function Toast() {
    const { toast } = useOnboarding()
    return (
        <div role="status" aria-live="polite" className="fixed bottom-4 inset-x-0 z-70 flex justify-center px-4 pointer-events-none">
            {toast && (
                <p className="pointer-events-auto max-w-md text-sm text-[#e8e6f0] bg-[#13121c] border border-[#2a2840] rounded-xl px-4 py-3 shadow-xl motion-safe:animate-[intro-in_.2s_ease-out]">
                    {toast}
                </p>
            )}
        </div>
    )
}
