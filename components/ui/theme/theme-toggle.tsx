"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null; // Avoid hydration mismatch by not rendering anything on server
  }

  const toggleTheme = () => {
    console.log({
      currentState: {
        theme,
        resolvedTheme,
        systemTheme,
      }
    });
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    console.log('Switching to:', newTheme);
    setTheme(newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800"
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
      title={`Current theme: ${theme} (Resolved: ${resolvedTheme})`}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-5 w-5" data-testid="sun-icon" />
      ) : (
        <Moon className="h-5 w-5" data-testid="moon-icon" />
      )}
    </button>
  );
}