import type { Metadata } from "next"
import { cache } from "react"
import { getPostBySlug } from "@/lib/blog"

// Deduplicate the DB call between generateMetadata and the layout render
const fetchPost = cache((slug: string) => getPostBySlug(slug))

type Props = {
    params: Promise<{ slug: string }>
    children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const post = await fetchPost(slug)

    if (!post) {
        return {
            title: "Post Not Found",
            description: "This blog post could not be found.",
        }
    }

    return {
        title: post.title,
        description: post.excerpt,
        openGraph: {
            title: post.title,
            description: post.excerpt,
            type: "article",
            url: `/blog/${post.slug}`,
            publishedTime: post.created_at,
            tags: post.tags,
            images: [
                {
                    url: `/blog/${post.slug}/opengraph-image`,
                    width: 1200,
                    height: 630,
                    alt: post.title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: post.title,
            description: post.excerpt,
            images: [`/blog/${post.slug}/opengraph-image`],
        },
    }
}

export default async function BlogPostLayout({ params, children }: Props) {
    const { slug } = await params
    const post = await fetchPost(slug)

    const articleJsonLd = post
        ? {
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: post.title,
              description: post.excerpt,
              datePublished: post.created_at,
              keywords: post.tags.join(", "),
              author: {
                  "@type": "Person",
                  name: "Jorge Alejandro Vilanova Alvarado",
                  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://java.dev",
              },
          }
        : null

    return (
        <>
            {articleJsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
                />
            )}
            {children}
        </>
    )
}
