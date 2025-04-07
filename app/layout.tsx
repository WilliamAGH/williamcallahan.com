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
import { Inter } from "next/font/google";
import { Suspense } from 'react'
import "./globals.css";
import { Providers } from "./providers";
// Import the new ClientTerminal wrapper and other UI components
import { Navigation, SocialIcons, ThemeToggle } from "../components/ui";
import { ClientTerminal } from "../components/ui/terminal/terminal.client"; // Import the new client component
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
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
            {/* Replacing the entire header section to ensure correct structure */}
            <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-50">
              <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                <Suspense fallback={null}>
                  <Navigation />
                </Suspense>
                <div className="flex items-center space-x-4">
                  <SocialIcons />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            {/* End of replaced header section */}
             <main className="pt-24 pb-16 px-4">
               {/* Use the ClientTerminal component here */}
               <ClientTerminal />
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
