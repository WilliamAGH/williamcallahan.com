/**
 * Debounce Hook
 * 
 * Custom React hook that debounces a value. The debounced value will only
 * update after the specified delay has passed without the value changing.
 * 
 * @module hooks/use-debounce
 */

"use client";

import { useEffect, useState } from "react";

/**
 * Debounces a value by delaying updates until after wait milliseconds have elapsed
 * since the last time the debounced value was updated.
 * 
 * @template T The type of the value being debounced
 * @param value The value to debounce
 * @param delay The number of milliseconds to delay
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 * 
 * // Effect will only run when user stops typing for 300ms
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     performSearch(debouncedSearchTerm);
 *   }
 * }, [debouncedSearchTerm]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (also on component unmount)
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // Only re-run if value or delay changes

  return debouncedValue;
}