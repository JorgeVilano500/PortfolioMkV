import { ImageResponse } from "next/og"
import { getPostBySlug } from "@/lib/blog"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

type Props = {
    params: Promise<{ slug: string }>
}

export default async function OGImage({ params }: Props) {
    const { slug } = await params
    const post = await getPostBySlug(slug)

    const title = post?.title ?? "Blog Post"
    const excerpt = post?.excerpt ?? ""
    const emoji = post?.cover_emoji ?? "📝"

    return new ImageResponse(
        (
            <div
                style={{
                    background: "#0a0a0f",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    padding: "80px",
                    fontFamily: "sans-serif",
                    position: "relative",
                }}
            >
                {/* Glow */}
                <div
                    style={{
                        position: "absolute",
                        top: -60,
                        right: -60,
                        width: 480,
                        height: 480,
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(124,109,255,0.3) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />

                {/* Emoji icon box */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 80,
                        height: 80,
                        borderRadius: 20,
                        background: "#1e1c2e",
                        fontSize: 40,
                        marginBottom: 32,
                    }}
                >
                    {emoji}
                </div>

                {/* Blog label */}
                <div
                    style={{
                        fontSize: 12,
                        letterSpacing: "0.25em",
                        textTransform: "uppercase",
                        color: "#7c6dff",
                        fontWeight: 700,
                        marginBottom: 20,
                        display: "flex",
                    }}
                >
                    JAVA.dev · Blog
                </div>

                {/* Title */}
                <div
                    style={{
                        fontSize: title.length > 40 ? 48 : 60,
                        fontWeight: 900,
                        color: "#f0eeff",
                        lineHeight: 1.15,
                        marginBottom: 24,
                        display: "flex",
                        maxWidth: 900,
                        letterSpacing: "-1px",
                    }}
                >
                    {title}
                </div>

                {/* Excerpt */}
                {excerpt && (
                    <div
                        style={{
                            fontSize: 20,
                            color: "#6b6880",
                            maxWidth: 750,
                            lineHeight: 1.5,
                            display: "flex",
                            overflow: "hidden",
                        }}
                    >
                        {excerpt.length > 120 ? excerpt.slice(0, 120) + "…" : excerpt}
                    </div>
                )}

                {/* Author badge */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 60,
                        right: 80,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "#13121c",
                        border: "1px solid #2a2840",
                        borderRadius: 99,
                        padding: "10px 20px",
                    }}
                >
                    <span style={{ color: "#AFA9EC", fontSize: 14, fontWeight: 600, display: "flex" }}>
                        Jorge Alejandro Vilanova
                    </span>
                </div>
            </div>
        ),
        { ...size }
    )
}
