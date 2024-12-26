"use client";

import { ThemeProvider } from "next-themes";
import { TerminalProvider } from "@/components/ui/terminal/terminal-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TerminalProvider>
        {children}
      </TerminalProvider>
    </ThemeProvider>
  );
}