/**
 * Mock for next-themes
 */
import { vi } from "vitest";
import type { ReactNode } from "react";
import type { UseThemeProps } from "next-themes";

export const useTheme = () => ({
  theme: "light",
  setTheme: vi.fn<UseThemeProps["setTheme"]>(),
  resolvedTheme: "light",
  themes: ["light", "dark"],
  systemTheme: "light",
  forcedTheme: undefined,
});

export const ThemeProvider = ({ children }: { children: ReactNode }): ReactNode => children;
