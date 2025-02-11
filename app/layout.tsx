// app/layout.tsx

/**
 * Root Layout Component
 * @module app/layout
 * @description
 * The root layout component that wraps all pages in the application.
 * Implements:
 * - Global styles and fonts
 * - Theme provider and analytics
 * - Navigation and header
 * - SEO metadata
 */

import type { Metadata } from "next";
import { Suspense } from 'react'
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation, Terminal, SocialIcons, ThemeToggle } from "../components/ui";
import { metadata as siteMetadata, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "../data/metadata";

import { Analytics } from '@/components/analytics/Analytics'

/** Load Inter font with Latin subset */
const inter = Inter({ subsets: ["latin"] });

/**
 * Global metadata configuration for the application
 * Follows Next.js 14 metadata standards and handles different environments
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://williamcallahan.com'
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  authors: [{ name: SITE_NAME, url: 'https://williamcallahan.com' }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: true,
    address: false,
    telephone: false,
    date: false,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: 'https://williamcallahan.com',
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    images: [siteMetadata.defaultImage],
  },
  twitter: {
    card: 'summary_large_image',
    site: siteMetadata.social.twitter,
    creator: siteMetadata.social.twitter,
  },
  alternates: {
    ...(process.env.NODE_ENV === 'production' && {
      canonical: 'https://williamcallahan.com'
    }),
  },
};

/**
 * Root Layout Component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render
 * @returns {JSX.Element} The root layout structure
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <script src="/scripts/theme-init.js" />
      </head>
      <body className={`${inter.className} overscroll-none`}>
        <Providers>
          <div
            className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100"
            style={{
              transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out',
              transitionDelay: '0.1s'
            }}
          >
            <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-40">
              <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                <Navigation />
                <div className="flex items-center gap-4 relative z-50">
                  <SocialIcons />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="pt-24 pb-16 px-4">
              <Terminal />
              {children}
            </main>
          </div>
        </Providers>
        <Suspense fallback={<></>}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
