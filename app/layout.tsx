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
import { DEFAULT_METADATA } from "../lib/seo";
import { API_BASE_URL } from "../lib/constants";

import { Analytics } from '@/components/analytics/Analytics'

/** Load Inter font with Latin subset */
const inter = Inter({ subsets: ["latin"] });

/**
 * Global metadata configuration for the application
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export const metadata: Metadata = {
  title: DEFAULT_METADATA.title,
  description: DEFAULT_METADATA.description,
  metadataBase: new URL(API_BASE_URL),
  openGraph: {
    title: DEFAULT_METADATA.openGraph?.title,
    description: DEFAULT_METADATA.openGraph?.description,
    type: DEFAULT_METADATA.openGraph?.type ?? "website",
    url: DEFAULT_METADATA.openGraph?.url,
    images: [
      {
        url: `${API_BASE_URL}/images/william.jpeg`,
        width: 1200,
        height: 630,
        alt: 'William Callahan',
      },
    ],
  },
  twitter: {
    card: DEFAULT_METADATA.twitter?.card ?? "summary_large_image",
    title: DEFAULT_METADATA.twitter?.title,
    description: DEFAULT_METADATA.twitter?.description,
    creator: DEFAULT_METADATA.twitter?.creator,
    images: [`${API_BASE_URL}/images/william.jpeg`],
  },
  alternates: {
    canonical: API_BASE_URL,
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
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
            <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-50">
              <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                <Navigation />
                <div className="flex items-center space-x-4">
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
