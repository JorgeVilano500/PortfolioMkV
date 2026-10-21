"use client"

import { useEffect, useState } from "react"

// ─── Admin gate ───────────────────────────────────────────────────────────────
// Wraps the /studio and /logistics pages. The password is sent once to
// POST /api/auth, which answers with an HttpOnly session cookie — the browser
// attaches it to every same-origin fetch, so pages never hold the password.

type Status = "checking" | "signed-out" | "signed-in"

export function AdminGate({
    title,
    description,
    children,
}: {
    title: string
    description: string
    children: React.ReactNode
}) {
    const [status, setStatus] = useState<Status>("checking")

    useEffect(() => {
        // Older builds kept the raw password here — make sure it's gone.
        try { sessionStorage.removeItem("_lk") } catch { /* ignore */ }

        fetch("/api/auth")
            .then((r) => r.json() as Promise<{ authenticated?: boolean }>)
            .then((d) => setStatus(d.authenticated ? "signed-in" : "signed-out"))
            .catch(() => setStatus("signed-out"))
    }, [])

    if (status === "checking") return null
    if (status === "signed-out") {
        return <PasswordGate title={title} description={description} onAuth={() => setStatus("signed-in")} />
    }
    return <>{children}</>
}

// ─── Password form ────────────────────────────────────────────────────────────

function PasswordGate({ title, description, onAuth }: { title: string; description: string; onAuth: () => void }) {
    const [value, setValue]   = useState("")
    const [error, setError]   = useState<string | null>(null)
    const [loading, setLoad]  = useState(false)

    const attempt = async () => {
        if (!value) return
        setLoad(true)
        setError(null)
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: value }),
            })
            if (res.ok) {
                setValue("")
                onAuth()
            } else {
                setError(res.status === 429 ? "Too many attempts. Try again later." : "Incorrect password.")
            }
        } catch {
            // Network failure — surface it instead of leaving the button stuck on "Checking…"
            setError("Network error. Try again.")
        } finally {
            setLoad(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
            <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-8 w-full max-w-sm">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Restricted</p>
                <h1 className="font-syne font-extrabold text-2xl text-[#f0eeff] mb-1">{title}</h1>
                <p className="text-sm text-[#555370] mb-6">{description}</p>
                <input
                    type="password"
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="current-password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && attempt()}
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-4 py-3 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors mb-3"
                />
                {error && <p className="text-xs text-pink-400 mb-3">{error}</p>}
                <button
                    onClick={attempt}
                    disabled={loading || !value}
                    className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer"
                >
                    {loading ? "Checking…" : "Enter"}
                </button>
            </div>
        </div>
    )
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export function SignOutButton() {
    const signOut = () => {
        fetch("/api/auth", { method: "DELETE" })
            .catch(() => { /* reload anyway; the gate re-checks the session */ })
            .finally(() => window.location.reload())
    }

    return (
        <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#888] hover:text-[#c4c0d8] hover:bg-[#1e1c2e] transition-colors"
        >
            Sign out
        </button>
    )
}
