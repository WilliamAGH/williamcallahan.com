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
import { ErrorBoundary } from '@/components/ui/error-boundary.client';
import { SvgTransformFixer } from '../components/utils/svg-transform-fixer.client';

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

        {/* Script to suppress hydration warnings from browser extensions and fix SVG transform attributes */}
        <Script id="suppress-hydration-warnings" strategy="beforeInteractive">
          {`
            (function() {
              // Suppress error logging for certain errors
              const originalConsoleError = console.error;
              console.error = function() {
                // Don't log specific errors we want to suppress
                if (arguments[0] && typeof arguments[0] === 'string') {
                  // Check for specific errors to suppress
                  if (
                    // Suppress Dark Reader related hydration errors
                    (arguments[0].includes('Hydration failed because') &&
                      (arguments[0].includes('data-darkreader') ||
                       arguments[0].includes('darkreader-inline') ||
                       arguments[0].includes('attribute style'))
                    ) ||
                    // Suppress SVG transform attribute errors
                    arguments[0].includes('<svg> attribute transform') ||
                    arguments[0].includes('Expected')
                  ) {
                    return; // Ignore this error
                  }
                }

                // Pass through all other errors to the original console.error
                return originalConsoleError.apply(console, arguments);
              };

              // Fix SVG transform attributes on page load
              document.addEventListener('DOMContentLoaded', function() {
                try {
                  // Fix SVG transform attributes by adding parentheses
                  const svgs = document.querySelectorAll('svg[transform]');
                  svgs.forEach(function(svg) {
                    const transform = svg.getAttribute('transform');
                    if (transform && transform.includes('translate') && !transform.includes('(')) {
                      // Get the transform parts
                      const parts = transform.match(/^(\\w+)(\\S+)$/);
                      if (parts && parts.length >= 3) {
                        const func = parts[1]; // e.g. "translateY"
                        const value = parts[2]; // e.g. "0.5px"
                        // Apply corrected transform with parentheses
                        svg.setAttribute('transform', func + '(' + value + ')');
                      } else {
                        // If we can't parse it properly, use CSS transform instead
                        const style = svg.getAttribute('style') || '';
                        svg.setAttribute('style', style + '; transform: ' + transform + ';');
                        svg.removeAttribute('transform');
                      }
                    }
                  });
                } catch (e) {
                  // Silent failure - don't break the page if this fails
                  console.warn('SVG transform fix failed:', e);
                }
              });
            })();
          `}
        </Script>
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
            {/* Add SVG Transform Fixer */}
            <SvgTransformFixer />
            {/* Revert to direct rendering */}
            <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
              <ErrorBoundary silent>
                <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-50">
                  <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Suspense fallback={null}>
                      {/* Navigation component doesn't need props anymore */}
                      <Navigation />
                    </Suspense>
                    {/* Secondary toolbar items with their own container */}
                    <div className="flex items-center">
                      <Suspense fallback={null}>
                        <SocialIcons />
                      </Suspense>
                      <div className="ml-2">
                        <ThemeToggle />
                      </div>
                    </div>
                  </div>
                </header>
              </ErrorBoundary>

              <main className="pt-24 pb-16 px-4 motion-safe:transition-opacity motion-safe:duration-200">
                <ErrorBoundary silent>
                  <ClientTerminal />
                </ErrorBoundary>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>

              <ErrorBoundary silent>
                <FloatingRestoreButtons />
              </ErrorBoundary>
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
