/**
 * Providers Component
 *
 * This component is responsible for providing the necessary providers to the application.
 * It wraps the application in a ThemeProvider and a TerminalProvider.
 *
 */

"use client";

import { ThemeProvider } from "@/components/ui/theme/theme-provider";
import { TerminalProvider } from "@/components/ui/terminal";
import { Suspense, useEffect } from "react";

/**
 * Client-side error logging for catching JavaScript errors,
 * particularly chunk loading errors in production.
 */
function ErrorLogger() {
  useEffect(() => {
    // Handler for uncaught errors
    const handleError = (event: ErrorEvent) => {
      // Check if it's a chunk loading error
      const isChunkError = event.message.includes('Loading chunk') ||
                          event.message.includes('ChunkLoadError') ||
                          event.filename?.includes('_next/static/chunks');

      console.error('[Client Error Logger]', {
        message: event.message,
        source: event.filename || 'unknown',
        line: event.lineno,
        column: event.colno,
        isChunkError,
        timestamp: new Date().toISOString(),
        url: window.location.href
      });

      // Uncomment to automatically reload the page after a chunk error
      // if (isChunkError) {
      //   window.location.reload();
      // }
    };

    // Handler for failed resource loads (like scripts, css, etc)
    const handleResourceError = (event: Event) => {
      const target = event.target as HTMLElement;

      // Only proceed if it's a script element (chunk loading)
      if (target.tagName === 'SCRIPT' && target.getAttribute('src')?.includes('_next/static/chunks')) {
        console.error('[Resource Load Error]', {
          resource: target.getAttribute('src'),
          type: target.tagName,
          timestamp: new Date().toISOString(),
          url: window.location.href
        });
      }
    };

    // Add event listeners
    window.addEventListener('error', handleError);
    document.addEventListener('error', handleResourceError, true); // Capture phase

    // Cleanup
    return () => {
      window.removeEventListener('error', handleError);
      document.removeEventListener('error', handleResourceError, true);
    };
  }, []);

  return null; // This component doesn't render anything
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      disableTransitionOnChange
    >
      {/* Remove WindowControlsProvider wrapper */}
      <TerminalProvider>
        <ErrorLogger />
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </TerminalProvider>
    </ThemeProvider>
  );
}