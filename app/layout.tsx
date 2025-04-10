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
// Import IBM Plex Mono font (regular weight)
import "@fontsource/ibm-plex-mono/400.css";
// Import our custom code block styling
import './code-blocks.css';
// Import PrismJS theme
import '../components/ui/code-block/prism-syntax-highlighting/prism.css';
import { Providers } from "./providers.client";
// Re-add direct imports
import { Navigation, SocialIcons, ThemeToggle } from "../components/ui";
import { ClientTerminal } from "../components/ui/terminal/terminal.client";
import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";
import { BodyClassManager } from "@/components/utils/body-class-manager.client";
import { AnchorScrollManager } from "@/components/utils/anchor-scroll-manager.client"; // Re-import the anchor handler
import { FloatingRestoreButtons } from "@/components/ui/window/floating-restore-buttons.client";
import { metadata as siteMetadata, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "../data/metadata";

import { Analytics } from '@/components/analytics/analytics.client'

// Add server transition handler
import Script from 'next/script';

/** Load Inter font with Latin subset */
const inter = Inter({ subsets: ["latin"] });

// lib/blog/mdx.ts collapse-dropdown.client.tsx mdx-content.tsx
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
    <html
      lang="en"
      suppressHydrationWarning
      className="overflow-x-hidden"
    >
      <head>
        {/* Resource hints for faster initial page load */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://williamcallahan.com" />
        <link rel="dns-prefetch" href="https://icons.duckduckgo.com" />
        {/* Next.js automatically handles font preloading */}
        {/* Add meta tag to signal native theme handling */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${inter.className} overflow-x-hidden`} suppressHydrationWarning>
        {/* Add script to help with state preservation during server transitions */}
        <Script id="server-transition-handler" strategy="beforeInteractive">
          {`
            // Track page loads to detect potential server transitions
            (function() {
              try {
                const lastLoadTime = parseInt(sessionStorage.getItem('_last_load_time') || '0');
                const currentTime = Date.now();

                // If reloading within 2 seconds, likely a server transition
                if (currentTime - lastLoadTime < 2000) {
                  document.documentElement.classList.add('server-transition');
                  setTimeout(() => {
                    document.documentElement.classList.remove('server-transition');
                  }, 1000);
                }

                // Update last load time
                sessionStorage.setItem('_last_load_time', currentTime.toString());
              } catch(e) {
                console.error('Error in transition handler:', e);
              }
            })();
          `}
        </Script>
        <Providers>
          <GlobalWindowRegistryProvider>
            <BodyClassManager />
            <AnchorScrollManager /> {/* Re-activate the anchor scroll handler */}
            {/* Revert to direct rendering */}
            <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
              <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-50">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                  <Suspense fallback={null}>
                    {/* Navigation component doesn't need props anymore */}
                    <Navigation />
                  </Suspense>
                  {/* Render secondary icons directly again */}
                  <div className="flex items-center space-x-4">
                    <SocialIcons />
                    <ThemeToggle />
                  </div>
                </div>
              </header>
              <main className="pt-24 pb-16 px-4 motion-safe:transition-opacity motion-safe:duration-200">
                <ClientTerminal />
                {children}
              </main>
              <FloatingRestoreButtons />
            </div>
          </GlobalWindowRegistryProvider>
        </Providers>
        <Suspense fallback={<></>}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
