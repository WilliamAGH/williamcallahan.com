/**
 * Theme Toggle Component
 *
 * Provides a button to toggle between light and dark themes.
 * Handles hydration safely by only rendering after mount.
 */
"use client";

import { THEME_TIMESTAMP_KEY } from "@/lib/constants";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const isDevelopment = process.env.NODE_ENV === "development";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Preserve space to avoid layout shift but keep it invisible during SSR/initial hydration.
    return <span className="inline-block h-7 w-7 opacity-0" aria-hidden="true" />;
  }

  // Always use resolvedTheme for determining the visual state (i.e., what icon to show)
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    const newTheme = isDark ? "light" : "dark";
    if (isDevelopment) {
      console.log(`[ThemeDev] ThemeToggle: User clicked. Current resolvedTheme: '${resolvedTheme}'.`);
      console.log(`[ThemeDev] ThemeToggle: ACTION - Setting theme to '${newTheme}'. (User override)`);
    }
    setTheme(newTheme);
    try {
      localStorage.setItem(THEME_TIMESTAMP_KEY, Date.now().toString());
      if (isDevelopment) {
        console.log("[ThemeDev] ThemeToggle: Stored explicit theme choice timestamp.");
      }
    } catch (error) {
      if (isDevelopment) {
        console.error("[ThemeDev] ThemeToggle: Error setting theme timestamp in localStorage.", error);
      }
      // Consider setting a fallback indicator or using an alternative storage method
    }
  };

  return (
    <button
      type="button"
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
