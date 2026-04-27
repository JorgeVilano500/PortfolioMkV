"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components"
import { Modal } from "@/components/features/Modal"
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer"
import { getPosts, getPostContent, formatDate, themeMap, type Post } from "@/lib/blog"

type OpenPost = Post & { content: string | null }

function SkeletonCard({ cols }: { cols: string }) {
    return (
        <div className={`${cols} bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 min-h-[220px] animate-pulse`}>
            <div className="w-12 h-12 rounded-xl bg-[#1e1c2e] mb-4" />
            <div className="h-3 w-16 bg-[#1e1c2e] rounded mb-3" />
            <div className="h-5 w-3/4 bg-[#1e1c2e] rounded mb-2" />
            <div className="h-4 w-full bg-[#1e1c2e] rounded mb-1" />
            <div className="h-4 w-2/3 bg-[#1e1c2e] rounded" />
        </div>
    )
}

export default function Blog() {
    const [posts, setPosts] = useState<Post[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [openPost, setOpenPost] = useState<OpenPost | null>(null)
    const [contentLoading, setContentLoading] = useState(false)

    useEffect(() => {
        getPosts()
            .then(setPosts)
            .catch((e) => setError(e.message ?? "Failed to load posts"))
            .finally(() => setLoading(false))
    }, [])

    const handleOpen = async (post: Post) => {
        setOpenPost({ ...post, content: null })
        setContentLoading(true)
        try {
            const content = await getPostContent(post.id)
            setOpenPost({ ...post, content })
        } catch {
            setOpenPost({ ...post, content: "_Failed to load post content._" })
        } finally {
            setContentLoading(false)
        }
    }

    const handleClose = () => setOpenPost(null)

    const [featured, ...rest] = posts
    const sideCard = rest[0] ?? null
    const smallCards = rest.slice(1)

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Blog" />

            {/* Page header */}
            <section className="px-2 mb-8">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Writing</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">
                    Thoughts &amp; Ideas
                </h1>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                    Dev notes, project write-ups, and things I find interesting.
                </p>
            </section>

            {/* States */}
            {error && (
                <div className="bg-[#1a1216] border border-[#2e1f28] rounded-2xl p-6 text-pink-300 text-sm">
                    {error}
                </div>
            )}

            {!error && loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                    <SkeletonCard cols="col-span-1 md:col-span-2 xl:col-span-8" />
                    <SkeletonCard cols="col-span-1 xl:col-span-4" />
                    <SkeletonCard cols="col-span-1 xl:col-span-4" />
                    <SkeletonCard cols="col-span-1 xl:col-span-4" />
                    <SkeletonCard cols="col-span-1 xl:col-span-4" />
                </div>
            )}

            {!error && !loading && posts.length === 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
                    <span className="text-4xl">📝</span>
                    <p className="text-[#c4c0d8] font-medium">No posts yet</p>
                    <p className="text-xs text-[#555370]">Add your first post in Supabase and it will appear here.</p>
                </div>
            )}

            {!error && !loading && posts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">

                    {/* Featured post */}
                    {featured && (() => {
                        const t = themeMap[featured.theme] ?? themeMap.purple
                        return (
                            <button
                                onClick={() => handleOpen(featured)}
                                className={`col-span-1 md:col-span-2 xl:col-span-8 ${t.cardBg} rounded-2xl p-6 min-h-[260px] text-left relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`}
                            >
                                <div className="flex flex-col justify-between h-full">
                                    <div>
                                        <div className={`${t.iconBg} w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4`}>
                                            {featured.cover_emoji}
                                        </div>
                                        <p className={`text-[10px] tracking-widest uppercase font-medium mb-2 ${t.catColor}`}>
                                            Featured · {formatDate(featured.created_at)}
                                        </p>
                                        <h2 className="font-syne font-extrabold text-2xl text-[#f0eeff] tracking-tight leading-tight mb-3">
                                            {featured.title}
                                        </h2>
                                        <p className="text-sm text-[#6b6880] leading-relaxed mb-4 max-w-lg">
                                            {featured.excerpt}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {featured.tags.map((tag) => (
                                                <span key={tag} className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${t.tagStyle}`}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-5">
                                        <span className="text-xs text-[#555370]">{featured.reading_time} min read</span>
                                        <span className={`text-xs font-medium ${t.catColor}`}>Read post →</span>
                                    </div>
                                </div>
                            </button>
                        )
                    })()}

                    {/* Side card */}
                    {sideCard && (() => {
                        const t = themeMap[sideCard.theme] ?? themeMap.purple
                        return (
                            <button
                                onClick={() => handleOpen(sideCard)}
                                className={`col-span-1 xl:col-span-4 ${t.cardBg} rounded-2xl p-6 min-h-[260px] text-left relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`}
                            >
                                <div className="flex flex-col justify-between h-full">
                                    <div>
                                        <div className={`${t.iconBg} w-full h-14 rounded-2xl flex items-center justify-center text-2xl mb-4`}>
                                            {sideCard.cover_emoji}
                                        </div>
                                        <p className={`text-[10px] tracking-widest uppercase font-medium mb-2 ${t.catColor}`}>
                                            {formatDate(sideCard.created_at)}
                                        </p>
                                        <h3 className="font-syne font-bold text-xl text-[#f0eeff] leading-snug mb-2">
                                            {sideCard.title}
                                        </h3>
                                        <p className="text-xs text-[#6b6880] leading-relaxed mb-3 line-clamp-3">
                                            {sideCard.excerpt}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sideCard.tags.map((tag) => (
                                                <span key={tag} className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${t.tagStyle}`}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <span className="text-xs text-[#555370]">{sideCard.reading_time} min read</span>
                                        <span className={`text-xs font-medium ${t.catColor}`}>Read →</span>
                                    </div>
                                </div>
                            </button>
                        )
                    })()}

                    {/* Remaining posts */}
                    {smallCards.map((post) => {
                        const t = themeMap[post.theme] ?? themeMap.purple
                        return (
                            <button
                                key={post.id}
                                onClick={() => handleOpen(post)}
                                className={`col-span-1 xl:col-span-4 ${t.cardBg} rounded-2xl p-6 min-h-[200px] text-left relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer`}
                            >
                                <div className="flex flex-col justify-between h-full">
                                    <div>
                                        <div className={`${t.iconBg} w-full h-12 rounded-xl flex items-center justify-center text-xl mb-3`}>
                                            {post.cover_emoji}
                                        </div>
                                        <p className={`text-[10px] tracking-widest uppercase font-medium mb-1.5 ${t.catColor}`}>
                                            {formatDate(post.created_at)}
                                        </p>
                                        <h3 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug mb-2">
                                            {post.title}
                                        </h3>
                                        <p className="text-xs text-[#6b6880] leading-relaxed line-clamp-2">
                                            {post.excerpt}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {post.tags.slice(0, 2).map((tag) => (
                                                <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${t.tagStyle}`}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <span className="text-xs text-[#555370]">{post.reading_time} min</span>
                                    </div>
                                </div>
                            </button>
                        )
                    })}

                </div>
            )}

            {/* Blog post modal */}
            <Modal
                isOpen={openPost !== null}
                onClose={handleClose}
                title={openPost?.title}
                variant="dark"
                size="lg"
            >
                {contentLoading ? (
                    <div className="flex flex-col gap-3 animate-pulse py-2">
                        <div className="h-4 bg-[#1e1c2e] rounded w-full" />
                        <div className="h-4 bg-[#1e1c2e] rounded w-5/6" />
                        <div className="h-4 bg-[#1e1c2e] rounded w-4/6" />
                        <div className="h-4 bg-[#1e1c2e] rounded w-full mt-4" />
                        <div className="h-4 bg-[#1e1c2e] rounded w-3/4" />
                    </div>
                ) : openPost?.content ? (
                    <>
                        <MarkdownRenderer content={openPost.content} />
                        <div className="border-t border-[#2a2840] pt-4 mt-2 flex items-center justify-between">
                            <span className="text-xs text-[#555370]">
                                {openPost.reading_time} min read
                            </span>
                            <Link
                                href={`/blog/${openPost.slug}`}
                                onClick={handleClose}
                                className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                            >
                                Open full page ↗
                            </Link>
                        </div>
                    </>
                ) : null}
            </Modal>
        </div>
    )
}
