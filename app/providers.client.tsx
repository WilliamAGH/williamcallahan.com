/**
 * Providers Component
 *
 * This component is responsible for providing the necessary providers to the application.
 * It wraps the application in a ThemeProvider and a TerminalProvider.
 *
 */

"use client";

import { TerminalProvider } from "@/components/ui/terminal";
import { ThemeProvider } from "@/components/ui/theme/theme-provider.client";
import { Suspense } from "react";

// Memoize the entire providers component to prevent rerendering during navigation
function Providers({ children }: { children: React.ReactNode }) {
  // NOTE: Dark Reader detection and class addition is handled by an inline script in app/layout.tsx
  return (
    <ThemeProvider disableTransitionOnChange enableSystem attribute="class" defaultTheme="system">
      <TerminalProvider>
        <Suspense fallback={null}>{children}</Suspense>
      </TerminalProvider>
    </ThemeProvider>
  );
}

export { Providers };
