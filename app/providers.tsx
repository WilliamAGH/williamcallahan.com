"use client";

import { AppStateProvider } from "@/app/clientComponents/providers/appState";
import { TerminalProvider } from "@/components/ui/terminal/terminalContext";
import { Suspense } from "react";

/**
 * Root Providers Component
 *
 * Wraps the application with necessary providers following Next.js 14 patterns.
 * Uses Suspense for proper loading handling.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppStateProvider>
        <TerminalProvider>
          {children}
        </TerminalProvider>
      </AppStateProvider>
    </Suspense>
  );
}
