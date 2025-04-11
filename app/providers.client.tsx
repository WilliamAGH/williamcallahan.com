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
import { Suspense, useEffect, useRef, memo } from "react";

/**
 * Send error to server-side logging API with rate limiting and debouncing
 */
const reportErrorToServer = (() => {
  // Keep track of reported errors to avoid duplicates in the same session
  const reportedErrors = new Set<string>();
  // Keep track of the last error timestamp for rate limiting
  let lastErrorTime = 0;

  return (errorData: Record<string, any>) => {
    const now = Date.now();
    // Generate a simple hash of the error to avoid reporting duplicates
    const errorHash = `${errorData.type}-${errorData.resource || ''}-${errorData.message || ''}`;

    // Rate limiting: no more than 1 error every 10 seconds
    if (now - lastErrorTime < 10000) {
      return;
    }

    // Don't report the same error twice in the same session
    if (reportedErrors.has(errorHash)) {
      return;
    }

    // Add to reported errors set
    reportedErrors.add(errorHash);
    lastErrorTime = now;

    // Send to server
    fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...errorData,
        buildId: window.__NEXT_DATA__?.buildId || 'unknown',
        url: window.location.href,
        timestamp: new Date().toISOString()
      }),
      // Use keepalive to ensure the request completes even if the page is unloading
      keepalive: true
    }).catch(() => {
      // Fail silently - we don't want error reporting to cause more errors
    });
  };
})();

/**
 * Client-side error logging for catching JavaScript errors,
 * particularly chunk loading errors in production.
 * Memoized to prevent unnecessary re-renders during navigation.
 */
const ErrorLogger = memo(function ErrorLogger() {
  // Track errors to avoid spamming the console and server
  const errorCount = useRef<number>(0);
  const maxErrorsToReport = 5; // Maximum number of errors to report in a session

  useEffect(() => {
    // Handler for uncaught errors
    const handleError = (event: ErrorEvent) => {
      // Check if it's a chunk loading error
      const isChunkError = event.message.includes('Loading chunk') ||
                          event.message.includes('ChunkLoadError') ||
                          event.filename?.includes('_next/static/chunks');

      // Avoid reporting too many errors
      if (errorCount.current < maxErrorsToReport) {
        errorCount.current += 1;

        // Log to console
        console.error('[Client Error Logger]', {
          message: event.message,
          source: event.filename || 'unknown',
          line: event.lineno,
          column: event.colno,
          isChunkError,
          timestamp: new Date().toISOString(),
          url: window.location.href
        });

        // Send to server if it's a chunk error (what we're tracking)
        if (isChunkError) {
          reportErrorToServer({
            type: 'chunk_error',
            message: event.message,
            resource: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error?.stack
          });
        }
      }

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
        // Avoid reporting too many errors
        if (errorCount.current < maxErrorsToReport) {
          errorCount.current += 1;

          const resourceUrl = target.getAttribute('src');

          // Log to console
          console.error('[Resource Load Error]', {
            resource: resourceUrl,
            type: target.tagName,
            timestamp: new Date().toISOString(),
            url: window.location.href
          });

          // Send to server
          reportErrorToServer({
            type: 'resource_error',
            resource: resourceUrl,
            element: target.tagName,
            id: target.id,
            className: target.className
          });
        }
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
});

// Create a constant instance of the ErrorLogger to prevent re-creation
const ERROR_LOGGER_INSTANCE = <ErrorLogger />;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      disableTransitionOnChange
    >
      {/* Remove WindowControlsProvider wrapper */}
      <TerminalProvider>
        {/* Use the constant instance to prevent rerenders */}
        {ERROR_LOGGER_INSTANCE}
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </TerminalProvider>
    </ThemeProvider>
  );
}