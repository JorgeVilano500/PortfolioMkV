import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";
import { PageTracker } from "@/components/ui/PageTracker";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { IntroModal } from "@/components/onboarding/IntroModal";
import { TourSpotlight } from "@/components/onboarding/TourSpotlight";
import { SiteFooter } from "@/components/onboarding/SiteFooter";
import { Toast } from "@/components/onboarding/Toast";
import { serializeJsonLd } from "@/lib/json-ld";
import { siteUrl as getSiteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The brand faces (DESIGN_SYSTEM.md §3): Syne for display headings
// (`font-syne`), DM Sans for body text (`font-dm`). Both are variable fonts,
// so one self-hosted file each covers every weight; next/font serves them
// from this origin, so the CSP needs no font host and visitors never
// contact Google. They were never loaded before, so those classes fell
// back to Arial.
const syne = Syne({
  variable: "--font-syne-face",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-face",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = getSiteUrl();
const siteName = "JAVA.dev";
const fullName = "Jorge Alejandro Vilanova Alvarado";
const defaultTitle = `${siteName} — ${fullName}`;
const defaultDesc =
  "Full stack developer building interactive apps, clean code, and interfaces worth remembering.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: `%s | ${siteName}`,
  },
  description: defaultDesc,
  keywords: [
    "full stack developer",
    "React",
    "Next.js",
    "TypeScript",
    "portfolio",
    "Jorge Vilanova",
    "JAVA.dev",
    "web developer California",
  ],
  authors: [{ name: fullName }],
  creator: fullName,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: defaultTitle,
    description: defaultDesc,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: defaultTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDesc,
    images: ["/opengraph-image"],
    creator: "@JorgeVilano500",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: fullName,
  url: siteUrl,
  jobTitle: "Full Stack Developer",
  sameAs: [
    "https://github.com/JorgeVilano500",
    "https://www.linkedin.com/in/jorge-vilanova-983750100/",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${dmSans.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* First-visit intro, consent, and guided tour (consent gates PageTracker) */}
        <OnboardingProvider>
          <PageTracker />
          {children}
          <SiteFooter />
          <IntroModal />
          <TourSpotlight />
          <Toast />
        </OnboardingProvider>
      </body>
    </html>
  );
}
