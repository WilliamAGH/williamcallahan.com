"use client";

import { ThemeProvider } from "next-themes";
import { TerminalProvider } from "@/components/ui/terminal";
import { Suspense } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TerminalProvider>
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </TerminalProvider>
    </ThemeProvider>
  );
}
