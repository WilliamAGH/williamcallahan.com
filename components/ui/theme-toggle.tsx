"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, systemTheme } = useTheme();

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => setMounted(true), []);

  // Instead of not rendering anything, render a placeholder with the same dimensions
  if (!mounted) {
    return (
      <div
        className="p-2 rounded-lg w-9 h-9 relative z-50"
        aria-hidden="true"
      />
    );
  }

  const cycleTheme = () => {
    // Ensure we cycle in the correct order: system -> light -> dark -> system
    switch (theme) {
      case 'system':
        setTheme('light');
        break;
      case 'light':
        setTheme('dark');
        break;
      case 'dark':
        setTheme('system');
        break;
      default:
        setTheme('system');
    }
  };

  const currentTheme = theme === 'system' ? systemTheme : theme;

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800 relative z-50"
      aria-label="Toggle theme"
      title={`Current theme: ${theme}`}
      style={{ touchAction: 'manipulation' }}
    >
      {currentTheme === "dark" ? (
        <Sun className="h-5 w-5" data-testid="sun-icon" />
      ) : (
        <Moon className="h-5 w-5" data-testid="moon-icon" />
      )}
    </button>
  );
}
