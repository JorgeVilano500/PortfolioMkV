"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "@/components"
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer"
import { getPostBySlug, formatDate, themeMap, type PostWithContent } from "@/lib/blog"
import { MdContentCopy, MdCheck } from "react-icons/md"

function SkeletonPost() {
    return (
        <div className="animate-pulse max-w-3xl mx-auto">
            <div className="h-3 w-20 bg-[#1e1c2e] rounded mb-8" />
            <div className="h-16 w-16 bg-[#1e1c2e] rounded-2xl mb-4" />
            <div className="h-3 w-32 bg-[#1e1c2e] rounded mb-4" />
            <div className="h-9 w-3/4 bg-[#1e1c2e] rounded mb-3" />
            <div className="h-9 w-1/2 bg-[#1e1c2e] rounded mb-6" />
            <div className="h-px bg-[#2a2840] mb-8" />
            <div className="flex flex-col gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-4 bg-[#1e1c2e] rounded" style={{ width: `${70 + (i % 3) * 10}%` }} />
                ))}
            </div>
        </div>
    )
}

export default function BlogPost() {
    const { slug } = useParams<{ slug: string }>()
    const router = useRouter()

    const [post, setPost] = useState<PostWithContent | null | "loading">("loading")
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        getPostBySlug(slug).then((p) => setPost(p))
    }, [slug])

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Blog" />

            <div className="max-w-3xl mx-auto">

                {/* Top nav row */}
                <div className="flex items-center justify-between mb-10">
                    <button
                        onClick={() => router.push("/blog")}
                        className="flex items-center gap-2 text-xs text-[#555370] hover:text-[#c4c0d8] transition-colors cursor-pointer group"
                    >
                        <span className="group-hover:-translate-x-0.5 transition-transform duration-150">←</span>
                        All Posts
                    </button>

                    {post && post !== "loading" && (
                        <button
                            onClick={copyLink}
                            className="flex items-center gap-1.5 text-xs text-[#555370] hover:text-[#c4c0d8] transition-colors cursor-pointer"
                        >
                            {copied ? <MdCheck size={13} /> : <MdContentCopy size={13} />}
                            {copied ? "Copied!" : "Copy link"}
                        </button>
                    )}
                </div>

                {/* Loading */}
                {post === "loading" && <SkeletonPost />}

                {/* Not found */}
                {post === null && (
                    <div className="bg-[#1a1216] border border-[#2e1f28] rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
                        <span className="text-4xl">🔍</span>
                        <p className="text-[#c4c0d8] font-medium">Post not found</p>
                        <p className="text-xs text-[#555370]">
                            This post might not be published yet or the link is wrong.
                        </p>
                        <button
                            onClick={() => router.push("/blog")}
                            className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                        >
                            ← Back to blog
                        </button>
                    </div>
                )}

                {/* Post */}
                {post && post !== "loading" && (() => {
                    const t = themeMap[post.theme] ?? themeMap.purple
                    return (
                        <>
                            {/* Post header */}
                            <div className="mb-8">
                                <div className={`${t.iconBg} w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5`}>
                                    {post.cover_emoji}
                                </div>

                                <p className={`text-[10px] tracking-widest uppercase font-medium mb-3 ${t.catColor}`}>
                                    {formatDate(post.created_at)}
                                </p>

                                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight leading-tight mb-5">
                                    {post.title}
                                </h1>

                                {post.excerpt && (
                                    <p className="text-base text-[#6b6880] leading-relaxed mb-5 max-w-xl">
                                        {post.excerpt}
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center gap-3">
                                    {post.tags.map((tag) => (
                                        <span key={tag} className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${t.tagStyle}`}>
                                            {tag}
                                        </span>
                                    ))}
                                    <span className="text-xs text-[#555370]">
                                        {post.reading_time} min read
                                    </span>
                                </div>
                            </div>

                            <hr className="border-[#2a2840] mb-8" />

                            {/* Content */}
                            <div className="pb-16">
                                <MarkdownRenderer content={post.content} />
                            </div>
                        </>
                    )
                })()}

            </div>
        </div>
    )
}
