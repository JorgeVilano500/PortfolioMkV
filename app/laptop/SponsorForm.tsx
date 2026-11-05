"use client"

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { Modal } from "@/components/features/Modal"
import { SPONSOR_CTA_HREF } from "@/lib/laptop-stickers"
import { Turnstile, turnstileSiteKey } from "./Turnstile"
import {
    SPONSOR_LIMITS,
    SPOT_CHOICES,
    STICKER_ACCEPT,
    TURNSTILE_FIELD,
    checkStickerFile,
    formatOffer,
    spotLabel,
    validateSponsorFields,
    type SponsorFieldErrors,
    type SponsorSpot,
} from "@/lib/sponsorship"

type Summary = { email: string; affiliation: string; offer: number; spot: SponsorSpot; fileName: string }

type SubmitState =
    | { kind: "editing" }
    | { kind: "sending" }
    | { kind: "sent"; confirmationSent: boolean; reference: string; summary: Summary }

type ApiResponse = {
    ok?:               boolean
    confirmationSent?: boolean
    reference?:        string
    error?:            string
    fields?:           SponsorFieldErrors
}

// Field order, for moving focus to the first problem.
const FIELD_IDS: Record<keyof SponsorFieldErrors, string> = {
    email:       "sponsor-email",
    affiliation: "sponsor-affiliation",
    spot:        "sponsor-spot",
    offer:       "sponsor-offer",
    sticker:     "sponsor-sticker",
}

const inputClass = (invalid: boolean) =>
    `w-full bg-[#0a0a0f] border rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors ${invalid ? "border-pink-400" : "border-[#2a2840]"}`

const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The "Sponsor a spot" dialog: an offer form that becomes a receipt once sent. */
export function SponsorForm({ open, onClose, initialSpot }: { open: boolean; onClose: () => void; initialSpot: SponsorSpot }) {
    const [email, setEmail]             = useState("")
    const [affiliation, setAffiliation] = useState("")
    const [offer, setOffer]             = useState("")
    const [spot, setSpot]               = useState<SponsorSpot>(initialSpot)
    const [file, setFile]               = useState<File | null>(null)
    const [errors, setErrors]           = useState<SponsorFieldErrors>({})
    const [formError, setFormError]     = useState<string | null>(null)
    const [state, setState]             = useState<SubmitState>({ kind: "editing" })
    // The spam check (SECURITY.md S-40) shows only when a Turnstile site key is configured.
    const captchaOn                     = turnstileSiteKey() !== ""
    const [captcha, setCaptcha]         = useState<string | null>(null)
    const [captchaReset, setCaptchaReset] = useState(0)
    // Tokens are single-use: after any failed send, get a fresh one.
    const renewCaptcha = () => {
        if (!captchaOn) return
        setCaptcha(null)
        setCaptchaReset((n) => n + 1)
    }

    const sending = state.kind === "sending"
    // Closing mid-send would hide the result and invite a duplicate offer.
    const close = () => { if (!sending) onClose() }

    const clearError = (field: keyof SponsorFieldErrors) =>
        setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

    const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
        const picked = event.target.files?.[0] ?? null
        setFile(picked)
        setErrors((current) => ({ ...current, sticker: picked ? checkStickerFile(picked) ?? undefined : undefined }))
    }

    const showErrors = (next: SponsorFieldErrors) => {
        setErrors(next)
        const first = (Object.keys(FIELD_IDS) as (keyof SponsorFieldErrors)[]).find((field) => next[field])
        if (first) document.getElementById(FIELD_IDS[first])?.focus()
    }

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (sending) return
        setFormError(null)

        // Same rules as the server, for instant feedback. The server re-checks everything.
        const result    = validateSponsorFields({ email, affiliation, offer, spot })
        const fileError = checkStickerFile(file)
        const problems  = { ...("errors" in result ? result.errors : {}), ...(fileError ? { sticker: fileError } : {}) }
        if (Object.keys(problems).length > 0 || "errors" in result) return showErrors(problems)
        if (captchaOn && !captcha) return setFormError("Please complete the spam check above the Send button.")

        const data = new FormData()
        data.set("email", result.fields.email)
        data.set("affiliation", result.fields.affiliation)
        data.set("offer", offer)
        data.set("spot", result.fields.spot)
        data.set("sticker", file!)
        const honeypot = (event.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value
        if (honeypot) data.set("website", honeypot)
        if (captcha) data.set(TURNSTILE_FIELD, captcha)

        setState({ kind: "sending" })
        try {
            const res  = await fetch("/api/sponsorships", { method: "POST", body: data })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (res.ok && body.ok) {
                setState({
                    kind: "sent",
                    confirmationSent: body.confirmationSent === true,
                    reference: body.reference ?? "",
                    summary: { ...result.fields, fileName: file!.name },
                })
                return
            }
            setState({ kind: "editing" })
            renewCaptcha()
            if (res.status === 400 && body.fields) showErrors(body.fields)
            setFormError(body.error ?? "Something went wrong. Please try again.")
        } catch {
            setState({ kind: "editing" })
            renewCaptcha()
            setFormError("Network error. Check your connection and try again.")
        }
    }

    return (
        <Modal isOpen={open} onClose={close} title="Sponsor a spot" variant="dark">
            {state.kind === "sent" ? (
                <Receipt state={state} onDone={onClose} />
            ) : (
                <form onSubmit={submit} noValidate aria-describedby="sponsor-intro" className="flex flex-col gap-4">
                    <p id="sponsor-intro" className="text-sm text-[#8a88a0] leading-relaxed">
                        Send me your sticker and an offer. It&apos;s a starting point: we&apos;ll agree on the details by email, and nothing is charged here.
                    </p>

                    <Field id={FIELD_IDS.email} label="Your email" error={errors.email} hint="Where I'll reply.">
                        <input
                            id={FIELD_IDS.email}
                            type="email"
                            autoComplete="email"
                            data-autofocus
                            maxLength={SPONSOR_LIMITS.email}
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); clearError("email") }}
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={`${FIELD_IDS.email}-hint${errors.email ? ` ${FIELD_IDS.email}-error` : ""}`}
                            className={inputClass(Boolean(errors.email))}
                            placeholder="you@company.com"
                        />
                    </Field>

                    <Field id={FIELD_IDS.affiliation} label="Affiliation" error={errors.affiliation} hint="Company, project, club, or just your name.">
                        <input
                            id={FIELD_IDS.affiliation}
                            type="text"
                            autoComplete="organization"
                            maxLength={SPONSOR_LIMITS.affiliation}
                            value={affiliation}
                            onChange={(e) => { setAffiliation(e.target.value); clearError("affiliation") }}
                            aria-invalid={Boolean(errors.affiliation)}
                            aria-describedby={`${FIELD_IDS.affiliation}-hint${errors.affiliation ? ` ${FIELD_IDS.affiliation}-error` : ""}`}
                            className={inputClass(Boolean(errors.affiliation))}
                            placeholder="Acme Dev Tools"
                        />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field id={FIELD_IDS.spot} label="Preferred spot" error={errors.spot}>
                            <select
                                id={FIELD_IDS.spot}
                                value={spot}
                                onChange={(e) => { setSpot(e.target.value as SponsorSpot); clearError("spot") }}
                                aria-invalid={Boolean(errors.spot)}
                                className={`${inputClass(Boolean(errors.spot))} cursor-pointer`}
                            >
                                {SPOT_CHOICES.map((choice) => (
                                    <option key={choice.value} value={choice.value}>{choice.label}</option>
                                ))}
                            </select>
                        </Field>

                        <Field id={FIELD_IDS.offer} label="Your offer (USD)" error={errors.offer} hint="Negotiable.">
                            <div className="relative">
                                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#8a88a0]">$</span>
                                <input
                                    id={FIELD_IDS.offer}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    maxLength={12}
                                    value={offer}
                                    onChange={(e) => { setOffer(e.target.value); clearError("offer") }}
                                    aria-invalid={Boolean(errors.offer)}
                                    aria-describedby={`${FIELD_IDS.offer}-hint${errors.offer ? ` ${FIELD_IDS.offer}-error` : ""}`}
                                    className={`${inputClass(Boolean(errors.offer))} pl-7`}
                                    placeholder="250"
                                />
                            </div>
                        </Field>
                    </div>

                    <Field id={FIELD_IDS.sticker} label="Sticker file to print" error={errors.sticker} hint="PNG or JPG, up to 4 MB. At least 1,000 px across prints crisply.">
                        <input
                            id={FIELD_IDS.sticker}
                            type="file"
                            accept={STICKER_ACCEPT}
                            onChange={handleFile}
                            aria-invalid={Boolean(errors.sticker)}
                            aria-describedby={`${FIELD_IDS.sticker}-hint${errors.sticker ? ` ${FIELD_IDS.sticker}-error` : ""}`}
                            className="block w-full text-sm text-[#c4c0d8] cursor-pointer file:mr-3 file:rounded-lg file:border file:border-[#2a2840] file:bg-[#1e1c2e] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#c4c0d8] hover:file:bg-[#2a2840] file:cursor-pointer"
                        />
                        {file && !errors.sticker && (
                            <p className="text-xs text-[#c4c0d8] mt-1.5 truncate">Selected: {file.name} ({formatSize(file.size)})</p>
                        )}
                    </Field>

                    {captchaOn && <Turnstile onToken={setCaptcha} resetSignal={captchaReset} />}

                    {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
                    <div aria-hidden="true" className="sr-only">
                        <label htmlFor="sponsor-website">Website</label>
                        <input id="sponsor-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
                    </div>

                    <p className="text-xs text-[#8a88a0] leading-relaxed">
                        I&apos;ll only use these details to reply about this sponsorship. See the{" "}
                        <Link href="/privacy" className="text-[#AFA9EC] hover:underline">privacy policy</Link>.
                    </p>

                    {formError && <p role="alert" className="text-xs text-pink-400">{formError}</p>}

                    <button
                        type="submit"
                        disabled={sending}
                        className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13121c]"
                    >
                        {sending ? "Sending…" : "Send offer"}
                    </button>
                    <p className="text-xs text-[#8a88a0] text-center">
                        Prefer email? <Link href={SPONSOR_CTA_HREF} className="text-[#AFA9EC] hover:underline">Contact me directly</Link>.
                    </p>
                </form>
            )}
        </Modal>
    )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-medium text-[#c4c0d8] mb-1.5">{label}</label>
            {children}
            {hint && <p id={`${id}-hint`} className="text-xs text-[#8a88a0] mt-1.5">{hint}</p>}
            {error && <p id={`${id}-error`} className="text-xs text-pink-400 mt-1.5">{error}</p>}
        </div>
    )
}

function Receipt({ state, onDone }: { state: Extract<SubmitState, { kind: "sent" }>; onDone: () => void }) {
    const { summary } = state
    const rows: [string, string][] = [
        ["Email", summary.email],
        ["Affiliation", summary.affiliation],
        ["Preferred spot", spotLabel(summary.spot)],
        ["Offer", `${formatOffer(summary.offer)} (negotiable)`],
        ["Sticker file", summary.fileName],
        ...(state.reference ? [["Reference", state.reference] as [string, string]] : []),
    ]
    return (
        <div role="status" className="flex flex-col gap-4">
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">Offer sent</span>
                </div>
                <h3 className="font-syne font-bold text-xl text-[#f0eeff] mb-2">Thanks, I&apos;ll be in touch!</h3>
                <p className="text-sm text-[#8a88a0] leading-relaxed">
                    Your offer reached me, and I&apos;ll reply to <span className="text-[#c4c0d8]">{summary.email}</span> as soon as possible.{" "}
                    {state.confirmationSent
                        ? "A copy is on its way to your inbox."
                        : "I couldn't email you a copy just now, so here's what you sent. Take a screenshot if you'd like to keep it."}
                </p>
            </div>
            <dl className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4 grid gap-3">
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-[10px] tracking-widest uppercase font-medium text-[#8a88a0]">{label}</dt>
                        <dd className="text-sm text-[#f0eeff] wrap-break-word">{value}</dd>
                    </div>
                ))}
            </dl>
            <button
                type="button"
                // The submit button that had focus is gone; land on the receipt's action.
                ref={(el) => el?.focus({ preventScroll: true })}
                onClick={onDone}
                className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
            >
                Done
            </button>
        </div>
    )
}
