/**
 * Theme Toggle Component
 *
 * Provides a button to toggle between light and dark themes.
 * Handles hydration safely by only rendering after mount.
 */
"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      // Render an empty button with the same dimensions to prevent layout shift
      <button
        className="p-2 rounded-lg"
        aria-hidden="true"
        disabled
      >
        <div className="h-5 w-5" />
      </button>
    );
  }

  // Always use resolvedTheme for determining the visual state (i.e., what icon to show)
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    // Always explicitly toggle between light and dark, regardless of current theme
    // This ensures that even if current theme is "system", clicking still gives predictable toggle
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Current theme: ${theme} (Resolved: ${resolvedTheme})`}
    >
      {isDark ? (
        <Sun className="h-5 w-5" data-testid="sun-icon" />
      ) : (
        <Moon className="h-5 w-5" data-testid="moon-icon" />
      )}
    </button>
  );
}