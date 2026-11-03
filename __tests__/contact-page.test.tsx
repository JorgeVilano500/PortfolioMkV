/** @jest-environment jsdom */
/**
 * /contact — the message form and the social links. The form used to wipe
 * what had been typed when a field was left empty (React 19 resets a form
 * after its action runs); the Instagram card linked to "#" in a new tab; and
 * mailto: subjects carried raw spaces.
 */
import { render, screen } from "@testing-library/react"
import { CONTACT_EMAIL, mailtoLink } from "@/lib/site"

jest.mock("@/components", () => ({ Navbar: () => null }))

import Contact from "@/app/contact/page"

describe("mailtoLink", () => {
    it("percent-encodes the subject and body", () => {
        expect(mailtoLink("Hello from Ana & Bo", "Line 1\nLine 2?"))
            .toBe(`mailto:${CONTACT_EMAIL}?subject=Hello%20from%20Ana%20%26%20Bo&body=Line%201%0ALine%202%3F`)
    })

    it("omits an empty body", () => {
        expect(mailtoLink("Virtual coffee")).toBe(`mailto:${CONTACT_EMAIL}?subject=Virtual%20coffee`)
    })
})

describe("contact page", () => {
    it("requires both fields, so the browser blocks an empty send before React resets the form", () => {
        render(<Contact />)
        const name = screen.getByLabelText("Your name") as HTMLInputElement
        const message = screen.getByLabelText("Your message") as HTMLTextAreaElement
        expect(name.required).toBe(true)
        expect(message.required).toBe(true)
        expect(name.maxLength).toBeGreaterThan(0)
        expect(message.maxLength).toBeGreaterThan(0)
    })

    it("links every social card somewhere real (no '#')", () => {
        const { container } = render(<Contact />)
        expect(container.querySelector('a[href="#"]')).toBeNull()
        expect(screen.getByRole("link", { name: /Instagram/ }).getAttribute("href")).toBe("https://www.instagram.com/java.dev_/")
    })

    it("encodes the virtual-coffee subject", () => {
        render(<Contact />)
        expect(screen.getByRole("link", { name: /Let's chat/ }).getAttribute("href")).toBe(`mailto:${CONTACT_EMAIL}?subject=Virtual%20coffee`)
    })
})
