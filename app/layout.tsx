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
import { Suspense } from "react";
import "./globals.css";
// Import our custom code block styling
import "./code-blocks.css";
// Import PrismJS theme
import "../components/ui/code-block/prism-syntax-highlighting/prism.css";
import { FloatingRestoreButtons } from "@/components/ui/window/floating-restore-buttons.client";
import { AnchorScrollManager } from "@/components/utils/anchor-scroll-manager.client"; // Re-import the anchor handler
import { BodyClassManager } from "@/components/utils/body-class-manager.client";
import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";
// Re-add direct imports
import { Navigation, SocialIcons, ThemeToggle } from "../components/ui";
import { ClientTerminal } from "../components/ui/terminal/terminal.client";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  metadata as siteMetadata,
} from "../data/metadata";
import { Providers } from "./providers.client";

import { Analytics } from "@/components/analytics/analytics.client";
import { ErrorBoundary } from "@/components/ui/error-boundary.client";
import { OpenGraphLogo } from "@/components/seo";
import { SvgTransformFixer } from "../components/utils/svg-transform-fixer.client";
import { cn } from "../lib/utils";

/** Load Inter font with Latin subset and display swap */
const inter = Inter({
  subsets: ["latin"],
  display: "swap", // Prevent invisible text during font load
  preload: true,
  variable: "--font-inter",
});

/**
 * Global metadata configuration for the application
 * Follows Next.js 14 metadata standards and handles different environments
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://williamcallahan.com"
      : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  authors: [{ name: SITE_NAME, url: "https://williamcallahan.com" }],
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
    url: "https://williamcallahan.com",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [siteMetadata.defaultImage],
  },
  twitter: {
    card: "summary_large_image",
    site: siteMetadata.social.twitter,
    creator: siteMetadata.social.twitter,
  },
  alternates: {
    ...(process.env.NODE_ENV === "production" && {
      canonical: "https://williamcallahan.com",
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
    <html lang="en" suppressHydrationWarning className={cn("scroll-smooth")}>
      <head>
        <meta name="darkreader-lock" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* OpenGraph Logo - not natively supported by Next.js metadata API */}
        <OpenGraphLogo />
        {/* Resource hints for faster initial page load */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://williamcallahan.com" />
        <link rel="dns-prefetch" href="https://icons.duckduckgo.com" />
        {/* Next.js automatically handles font preloading */}
        {/* 
          Add meta tag to signal native theme handling.
          NOTE: This is not supported by Internet Explorer, which is fine as the browser is deprecated.
          This is important for modern browsers to respect user's theme preference.
        */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${inter.className} overflow-x-hidden`} suppressHydrationWarning>
        <Providers>
          <GlobalWindowRegistryProvider>
            <BodyClassManager />
            <AnchorScrollManager /> {/* Re-activate the anchor scroll handler */}
            {/* Add SVG Transform Fixer */}
            <SvgTransformFixer />
            {/* Revert to direct rendering */}
            <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
              <ErrorBoundary silent>
                <header className="relative w-full bg-white/80 dark:bg-[#232530]/90 backdrop-blur-sm z-[1000]">
                  {/* Add overflow-hidden for safety, ensure items can shrink */}
                  <div className="w-full max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px] mx-auto px-4 py-4 flex items-center justify-between overflow-hidden gap-4">
                    {/* Navigation should shrink if needed, but prioritize it */}
                    <div className="flex-1 min-w-0">
                      <Suspense fallback={null}>
                        {/* Navigation component */}
                        <Navigation />
                      </Suspense>
                    </div>
                    {/* Right-side actions container - Allow shrinking */}
                    {/* Add ml-2 to ensure minimum left margin matches right-side gap */}
                    <div className="flex items-center gap-2 ml-2 min-w-0 relative z-[1050]">
                      {/* Social Icons: Render condensed below lg, full above lg */}

                      {/* Condensed Version (X Only) - Hidden on lg and up */}
                      <div className="lg:hidden">
                        <Suspense fallback={null}>
                          {/* Render X icon only via prop */}
                          <SocialIcons showXOnly={true} />
                        </Suspense>
                      </div>

                      {/* Full Version - Hidden below lg */}
                      <div className="header-icons hidden lg:flex items-center p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700/50 shadow-sm">
                        <Suspense fallback={null}>
                          {/* Render all icons */}
                          <SocialIcons />
                        </Suspense>
                      </div>

                      {/* Theme Toggle - Always visible */}
                      <ThemeToggle />
                    </div>
                  </div>
                </header>
              </ErrorBoundary>

              <main className="pb-16 px-4 motion-safe:transition-opacity motion-safe:duration-200">
                <ErrorBoundary>
                  <ClientTerminal />
                </ErrorBoundary>
                <ErrorBoundary>{children}</ErrorBoundary>
              </main>

              <ErrorBoundary silent>
                <FloatingRestoreButtons />
              </ErrorBoundary>
            </div>
          </GlobalWindowRegistryProvider>
        </Providers>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
