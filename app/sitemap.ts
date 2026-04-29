import type { MetadataRoute } from "next"
import { getPosts } from "@/lib/blog"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://java.dev"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const posts = await getPosts()

    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: siteUrl,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 1,
        },
        {
            url: `${siteUrl}/work`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.8,
        },
        {
            url: `${siteUrl}/about`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.7,
        },
        {
            url: `${siteUrl}/blog`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
        },
        {
            url: `${siteUrl}/contact`,
            lastModified: new Date(),
            changeFrequency: "yearly",
            priority: 0.6,
        },
    ]

    const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
        url: `${siteUrl}/blog/${post.slug}`,
        lastModified: new Date(post.created_at),
        changeFrequency: "monthly" as const,
        priority: 0.7,
    }))

    return [...staticRoutes, ...blogRoutes]
}
