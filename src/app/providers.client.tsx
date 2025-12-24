/**
 * Providers Component
 *
 * This component is responsible for providing the necessary providers to the application.
 * It wraps the application in ClerkProvider for authentication and ThemeProvider for theming.
 * The TerminalProvider is localized to the terminal subtree.
 */

"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ThemeProvider, useTheme } from "@/components/ui/theme/theme-provider.client";
import { Suspense } from "react";

/**
 * Inner providers that need access to theme context
 */
function ThemedClerkProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: isDark ? "#60a5fa" : "#2563eb",
          colorBackground: isDark ? "#1a1b26" : "#ffffff",
          colorText: isDark ? "#e5e7eb" : "#1f2937",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

/**
 * Root providers component wrapping theme and auth
 */
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider disableTransitionOnChange enableSystem attribute="class" defaultTheme="system">
      <Suspense fallback={<div className="min-h-screen" aria-hidden="true" />}>
        <ThemedClerkProvider>{children}</ThemedClerkProvider>
      </Suspense>
    </ThemeProvider>
  );
}

export { Providers };
