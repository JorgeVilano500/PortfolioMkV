import type { MetadataRoute } from "next"

import { siteUrl as getSiteUrl } from "@/lib/site"

const siteUrl = getSiteUrl()

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/"],
        },
        sitemap: `${siteUrl}/sitemap.xml`,
    }
}
