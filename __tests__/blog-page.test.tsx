/** @jest-environment jsdom */
/**
 * /blog — the post list. When loading failed, the page used to print the raw
 * Supabase error message, which can name tables, columns or policies
 * (SECURITY.md: never show DB errors to clients).
 */
import { render, screen } from "@testing-library/react"

const mockGetPosts = jest.fn()
jest.mock("@/lib/blog", () => ({
    ...jest.requireActual("@/lib/blog"),
    getPosts: () => mockGetPosts(),
    getPostContent: jest.fn(),
}))
jest.mock("@/lib/supabase", () => ({ supabase: {} }))
jest.mock("@/components", () => ({ Navbar: () => null, Modal: () => null }))
jest.mock("@/components/ui/MarkdownRenderer", () => ({ MarkdownRenderer: () => null }))

import Blog from "@/app/blog/page"

it("shows a generic message, not the database's, when posts fail to load", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetPosts.mockRejectedValue(new Error('permission denied for table posts (column "draft_notes")'))
    render(<Blog />)
    expect(await screen.findByText(/couldn't be loaded right now/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/permission denied|draft_notes|table posts/)
    expect(console.error).toHaveBeenCalled() // still logged for debugging
})
