"use client";

import { ThemeProvider } from "next-themes";
import { TerminalProvider } from "@/components/ui/terminal/terminal-context";
import { Suspense } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Suspense fallback={null}>
        <TerminalProvider>
          {children}
        </TerminalProvider>
      </Suspense>
    </ThemeProvider>
  );
}
