/**
 * Command Input Component
 *
 * Terminal input field that prevents iOS Safari zoom while maintaining visual consistency.
 * Uses CSS transform to scale down the visually larger font size.
 */

"use client";

import { forwardRef, useCallback, useId, useState, useEffect } from "react";
import type { CommandInputProps } from "@/types/ui/terminal";

// Breakpoint for mobile placeholder (matches Tailwind's sm breakpoint)
const MOBILE_BREAKPOINT = 640;

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(function CommandInput(
  { value, onChange, onSubmit, disabled = false },
  ref,
) {
  // Generate unique ID for accessibility
  const inputId = useId();

  // Track hydration state to prevent SSR/client mismatch
  const [mounted, setMounted] = useState(false);
  // Track if we're on a mobile-sized screen for shorter placeholder
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Preload search when user types enough characters
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !disabled) {
        e.preventDefault();
        onSubmit(value);
      }
    },
    [value, onSubmit, disabled],
  );

  return (
    <div className="w-full table">
      <div className="flex items-center w-full">
        <span className="text-[#7aa2f7] select-none mr-2">$</span>
        <div className="relative flex-1 transform-gpu">
          <label htmlFor={inputId} className="sr-only">
            Terminal command
          </label>
          <input
            id={inputId}
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-transparent w-full focus:outline-none text-gray-300 caret-gray-300
                text-[16px] transform-gpu scale-[0.875] origin-left disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              /* Offset the larger font size to maintain layout */
              margin: "-0.125rem 0",
            }}
            aria-label="Terminal command input"
            placeholder={
              disabled
                ? "Processing..."
                : mounted && isMobile
                  ? "Enter command or search site here"
                  : "Enter a command or search the site here"
            }
            title="Terminal command input"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
});
