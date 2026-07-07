/**
 * lib/validation — shared input validation helpers.
 */
import {
    LIMITS,
    isValidSlug,
    isNonEmptyString,
    isStringMax,
    normalizeTags,
    normalizeTheme,
    estimateReadingTime,
    slugify,
} from "@/lib/validation"

describe("isValidSlug", () => {
    it.each(["hello", "hello-world", "post-2026", "a", "1-2-3"])("accepts %s", (s) => {
        expect(isValidSlug(s)).toBe(true)
    })

    it.each([
        "",
        "Hello",              // uppercase
        "hello world",        // space
        "-leading",
        "trailing-",
        "double--hyphen",
        "../../etc/passwd",   // path traversal attempt
        "<script>",
        "slug/with/slashes",
        "ünïcode",
    ])("rejects %j", (s) => {
        expect(isValidSlug(s)).toBe(false)
    })

    it("rejects non-strings and oversized slugs", () => {
        expect(isValidSlug(42)).toBe(false)
        expect(isValidSlug(null)).toBe(false)
        expect(isValidSlug("a".repeat(LIMITS.slug + 1))).toBe(false)
    })
})

describe("slugify", () => {
    it("converts a title to a valid slug", () => {
        expect(slugify("Hello, World! 2026")).toBe("hello-world-2026")
        expect(isValidSlug(slugify("Hello, World! 2026"))).toBe(true)
    })

    it("strips leading/trailing hyphens", () => {
        expect(slugify("  --Weird Title--  ")).toBe("weird-title")
    })

    it("collapses repeated separators", () => {
        expect(slugify("a   b---c")).toBe("a-b-c")
    })

    it("returns empty string for titles with no usable characters", () => {
        expect(slugify("🚀🚀🚀")).toBe("")
    })
})

describe("isNonEmptyString / isStringMax", () => {
    it("enforces presence, type, and max length", () => {
        expect(isNonEmptyString("ok", 10)).toBe(true)
        expect(isNonEmptyString("   ", 10)).toBe(false)
        expect(isNonEmptyString("", 10)).toBe(false)
        expect(isNonEmptyString(123, 10)).toBe(false)
        expect(isNonEmptyString("a".repeat(11), 10)).toBe(false)
    })

    it("isStringMax allows empty strings but enforces type/length", () => {
        expect(isStringMax("", 10)).toBe(true)
        expect(isStringMax("a".repeat(10), 10)).toBe(true)
        expect(isStringMax("a".repeat(11), 10)).toBe(false)
        expect(isStringMax({}, 10)).toBe(false)
    })
})

describe("normalizeTags", () => {
    it("passes through a valid array", () => {
        expect(normalizeTags(["a", "b"])).toEqual(["a", "b"])
    })

    it("splits comma-separated strings", () => {
        expect(normalizeTags("design, tutorial , ,react")).toEqual(["design", "tutorial", "react"])
    })

    it("returns [] for undefined/null", () => {
        expect(normalizeTags(undefined)).toEqual([])
        expect(normalizeTags(null)).toEqual([])
    })

    it("rejects non-string members instead of coercing objects", () => {
        expect(normalizeTags([{ evil: true }])).toBeNull()
        expect(normalizeTags([42])).toBeNull()
    })

    it("rejects too many or oversized tags", () => {
        expect(normalizeTags(Array(LIMITS.tagCount + 1).fill("t"))).toBeNull()
        expect(normalizeTags(["a".repeat(LIMITS.tag + 1)])).toBeNull()
    })
})

describe("normalizeTheme", () => {
    it("allows only known themes, defaulting to purple", () => {
        expect(normalizeTheme("green")).toBe("green")
        expect(normalizeTheme("pink")).toBe("pink")
        expect(normalizeTheme("purple")).toBe("purple")
        expect(normalizeTheme("red")).toBe("purple")
        expect(normalizeTheme({ toString: () => "green" })).toBe("purple")
    })
})

describe("estimateReadingTime", () => {
    it("returns at least 1 minute, even for empty content", () => {
        expect(estimateReadingTime("")).toBe(1)
        expect(estimateReadingTime("   ")).toBe(1)
    })

    it("rounds up at 200 wpm", () => {
        expect(estimateReadingTime(Array(200).fill("word").join(" "))).toBe(1)
        expect(estimateReadingTime(Array(201).fill("word").join(" "))).toBe(2)
        expect(estimateReadingTime(Array(1000).fill("word").join(" "))).toBe(5)
    })
})
