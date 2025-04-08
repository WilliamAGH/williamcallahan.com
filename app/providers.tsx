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
import { Suspense } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      disableTransitionOnChange
    >
      {/* Remove WindowControlsProvider wrapper */}
      <TerminalProvider>
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </TerminalProvider>
    </ThemeProvider>
  );
}
