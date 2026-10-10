/**
 * Command Input Component
 *
 * Terminal input field that prevents iOS Safari zoom while maintaining visual consistency.
 * Uses CSS transform to scale down the visually larger font size.
 */

"use client";

import { forwardRef, useCallback, useId, useSyncExternalStore } from "react";
import type { CommandInputProps } from "@/types/ui/terminal";

// Mobile placeholder query (below Tailwind's sm breakpoint of 640px)
const MOBILE_MEDIA_QUERY = "(max-width: 639.98px)";

const subscribeToMobileQuery = (onChange: () => void): (() => void) => {
  const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQueryList.addEventListener("change", onChange);
  return () => mediaQueryList.removeEventListener("change", onChange);
};
const getMobileQuerySnapshot = (): boolean => window.matchMedia(MOBILE_MEDIA_QUERY).matches;
const getMobileQueryServerSnapshot = (): boolean => false;

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(function CommandInput(
  { value, onChange, onSubmit, disabled = false },
  ref,
) {
  // Generate unique ID for accessibility
  const inputId = useId();

  // Server snapshot is false, so SSR and hydration render the desktop placeholder
  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    getMobileQuerySnapshot,
    getMobileQueryServerSnapshot,
  );

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
                : isMobile
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
