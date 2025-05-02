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
      // Render an empty button with the same dimensions to prevent layout shift during hydration
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
      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 
      bg-gray-200 dark:bg-gray-700 
      hover:bg-indigo-100 dark:hover:bg-indigo-900 
      border border-gray-300 dark:border-gray-600 
      text-gray-700 dark:text-gray-300
      hover:shadow-md hover:scale-105 active:scale-100"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Current theme: ${theme} (Resolved: ${resolvedTheme})`}
    >
      <div className="hidden [@media(min-width:1000px)]:block text-sm font-medium whitespace-nowrap overflow-hidden relative">
        <span className="inline-block transition-transform duration-200 group-hover:-translate-y-full">
          {isDark ? "Dark" : "Light"}
          <span className="hidden [@media(min-width:1100px)]:inline"> Mode</span>
        </span>
        <span className="absolute top-0 left-0 translate-y-full transition-transform duration-200 group-hover:translate-y-0">
          {isDark ? "Light" : "Dark"}
          <span className="hidden [@media(min-width:1100px)]:inline"> Mode</span>
        </span>
      </div>
      <div className="relative h-4 w-4 overflow-hidden">
        <div className="transition-transform duration-200 group-hover:-translate-y-full">
          {isDark ? (
            <Moon className="h-4 w-4" data-testid="moon-icon" />
          ) : (
            <Sun className="h-4 w-4" data-testid="sun-icon" />
          )}
        </div>
        <div className="absolute top-0 left-0 translate-y-full transition-transform duration-200 group-hover:translate-y-0">
          {isDark ? (
            <Sun className="h-4 w-4" data-testid="sun-icon" />
          ) : (
            <Moon className="h-4 w-4" data-testid="moon-icon" />
          )}
        </div>
      </div>
    </button>
  );
}