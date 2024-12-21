/**
 * Theme Toggle Component
 * 
 * Button component that toggles between light and dark themes.
 * Includes proper accessibility attributes and visual feedback.
 */

"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useMount } from "./use-mount";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMount();

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  );
}