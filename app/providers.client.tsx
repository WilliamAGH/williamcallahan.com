/**
 * Providers Component
 *
 * This component is responsible for providing the necessary providers to the application.
 * It wraps the application in a ThemeProvider. The TerminalProvider is localized to the terminal subtree.
 *
 */

"use client";

import { ThemeProvider } from "@/components/ui/theme/theme-provider.client";
import { Suspense } from "react";

// Memoize the entire providers component to prevent rerendering during navigation
function Providers({ children }: { children: React.ReactNode }) {
  // NOTE: Dark Reader detection and class addition is handled by an inline script in app/layout.tsx
  return (
    <ThemeProvider disableTransitionOnChange enableSystem attribute="class" defaultTheme="system">
      {/* Use min-h-screen fallback to prevent layout collapse during streaming hydration */}
      <Suspense fallback={<div className="min-h-screen" aria-hidden="true" />}>{children}</Suspense>
    </ThemeProvider>
  );
}

export { Providers };
