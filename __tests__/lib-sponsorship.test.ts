/**
 * lib/sponsorship — the "Sponsor a spot" field rules shared by the form and
 * POST /api/sponsorships. Security: email header tricks and link spam can't
 * get through, files are judged by their bytes, and every value is bounded.
 */
import {
    SPONSOR_LIMITS,
    SPOT_CHOICES,
    checkStickerFile,
    cleanFileName,
    cleanText,
    formatOffer,
    isValidEmail,
    parseOffer,
    sniffStickerType,
    spotLabel,
    validateSponsorFields,
} from "@/lib/sponsorship"

const valid = { email: "jane@acme.dev", affiliation: "Acme Dev Tools", offer: "250", spot: "slot-2" }

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)))

describe("isValidEmail", () => {
    it.each(["jane@acme.dev", "j.doe+stickers@mail.example.co.uk", "A_B-c%9@x-y.io"])("accepts %s", (email) => {
        expect(isValidEmail(email)).toBe(true)
    })

    it.each([
        ["no @", "jane.acme.dev"],
        ["no dotted domain", "jane@localhost"],
        ["spaces", "jane doe@acme.dev"],
        ["a header injection (CRLF)", "jane@acme.dev\r\nBcc: victim@x.com"],
        ["mailto: parameter tricks", "jane@acme.dev?bcc=victim@x.com"],
        ["a display name", "Jane <jane@acme.dev>"],
        ["over 254 characters", `${"a".repeat(250)}@acme.dev`],
        ["not a string", 42],
    ])("rejects %s", (_label, email) => {
        expect(isValidEmail(email)).toBe(false)
    })
})

describe("parseOffer / formatOffer", () => {
    it.each([["250", 250], ["1,500", 1500], ["$1,500.50", 1500.5], [" 99.9 ", 99.9], [75, 75]])("parses %p → %p", (input, expected) => {
        expect(parseOffer(input)).toBe(expected)
    })

    it.each([["abc"], [""], ["1e9"], ["-5"], ["12.345"], ["99999999"], ["0x10"], [null], [Number.NaN]])("rejects %p", (input) => {
        expect(parseOffer(input)).toBeNull()
    })

    it("formats US dollars, dropping .00", () => {
        expect(formatOffer(1500)).toBe("$1,500")
        expect(formatOffer(1500.5)).toBe("$1,500.50")
    })
})

describe("validateSponsorFields", () => {
    it("returns cleaned fields for a valid offer", () => {
        expect(validateSponsorFields({ ...valid, affiliation: "  Acme   Dev\tTools " })).toEqual({
            fields: { email: "jane@acme.dev", affiliation: "Acme Dev Tools", offer: 250, spot: "slot-2" },
        })
    })

    it("reports every bad field at once", () => {
        const result = validateSponsorFields({ email: "nope", affiliation: "", offer: "free", spot: "roof" })
        expect("errors" in result && Object.keys(result.errors).sort()).toEqual(["affiliation", "email", "offer", "spot"])
    })

    it.each([
        ["a URL", "Visit https://evil.example"],
        ["www.", "www.cheap-pills"],
        ["a bare domain (mail clients auto-link these)", "Get rich at evil.com today"],
        ["a dotted product name", "Node.js Meetup"],
    ])("refuses %s in the affiliation (no link-spam relay)", (_label, affiliation) => {
        const result = validateSponsorFields({ ...valid, affiliation })
        expect("errors" in result && result.errors.affiliation).toMatch(/web addresses/)
    })

    it("allows ordinary names with dots and initials", () => {
        for (const affiliation of ["St. Louis Devs", "U.S. Robotics", "J. Smith", "Node JS Meetup"]) {
            expect("fields" in validateSponsorFields({ ...valid, affiliation })).toBe(true)
        }
    })

    it("bounds the affiliation and the offer", () => {
        const long = validateSponsorFields({ ...valid, affiliation: "a".repeat(SPONSOR_LIMITS.affiliation + 1) })
        expect("errors" in long && long.errors.affiliation).toMatch(/under 120/)
        const small = validateSponsorFields({ ...valid, offer: "0.5" })
        expect("errors" in small && small.errors.offer).toMatch(/start at \$1/)
        const big = validateSponsorFields({ ...valid, offer: "1000001" })
        expect("errors" in big && big.errors.offer).toMatch(/maximum/)
    })

    it("strips control characters and line separators (they'd break subjects and logs)", () => {
        const sep = String.fromCharCode(0x2028)
        const result = validateSponsorFields({ ...valid, affiliation: `Acme\r\nBcc: x${sep}Tools` })
        expect("fields" in result && result.fields.affiliation).toBe("Acme Bcc: x Tools")
        expect(cleanText(`a${String.fromCharCode(0)}b${String.fromCharCode(0x85)}c`)).toBe("a b c")
    })

    it("accepts every listed spot, including 'any'", () => {
        for (const choice of SPOT_CHOICES) expect("fields" in validateSponsorFields({ ...valid, spot: choice.value })).toBe(true)
        expect(spotLabel("any")).toBe("Any spot")
        expect(spotLabel("slot-1")).toBe("Upper left")
    })
})

describe("files", () => {
    it("checks presence, size, and declared type in the browser", () => {
        expect(checkStickerFile(null)).toMatch(/Attach/)
        expect(checkStickerFile({ size: 0, type: "image/png" })).toMatch(/Attach/)
        expect(checkStickerFile({ size: SPONSOR_LIMITS.fileBytes + 1, type: "image/png" })).toMatch(/over 4 MB/)
        expect(checkStickerFile({ size: 10, type: "image/svg+xml" })).toMatch(/PNG, JPG, WebP, or PDF/)
        expect(checkStickerFile({ size: 10, type: "image/png" })).toBeNull()
        expect(checkStickerFile({ size: 10, type: "" })).toBeNull() // unknown type: the server sniffs it
    })

    it("recognises each accepted format by its magic bytes", () => {
        expect(sniffStickerType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png")
        expect(sniffStickerType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg")
        expect(sniffStickerType(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
        expect(sniffStickerType(ascii("%PDF-1.7\n"))).toBe("application/pdf")
    })

    it.each([
        ["SVG (scriptable)", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"],
        ["HTML renamed .png", "<!doctype html><script>alert(1)</script>"],
        ["an executable", "MZ\u0090\u0000"],
        ["RIFF that isn't WebP (WAV)", "RIFF\0\0\0\0WAVEfmt "],
        ["empty", ""],
    ])("rejects %s", (_label, content) => {
        expect(sniffStickerType(ascii(content))).toBeNull()
    })

    it("cleans file names for display: no paths, controls, or reserved characters", () => {
        expect(cleanFileName("C:\\Users\\x\\logo final.png")).toBe("logo final.png")
        expect(cleanFileName("../../etc/passwd")).toBe("passwd")
        expect(cleanFileName(`lo${String.fromCharCode(0)}go<>|.png`)).toBe("lo go.png")
        expect(cleanFileName("a".repeat(300) + ".png")).toHaveLength(SPONSOR_LIMITS.fileName)
        expect(cleanFileName(undefined)).toBe("sticker")
        expect(cleanFileName("")).toBe("sticker")
    })
})
