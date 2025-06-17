/**
 * use-window-state.ts
 *
 * Custom hook to manage window-like state (normal, minimized, maximized, closed)
 * for a specific component instance, with persistence in sessionStorage.
 *
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Define the possible states
export type WindowState = "normal" | "minimized" | "maximized" | "closed";

// Helper to generate storage key
const getStorageKey = (id: string): string => `windowState-${id}`;

// Helper function to safely access sessionStorage
const getSessionStorageState = (id: string): WindowState | null => {
  const key = getStorageKey(id);
  try {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(key) as WindowState | null;
    }
  } catch (error) {
    console.warn(`sessionStorage is not available for key ${key}:`, error);
  }
  return null;
};

// Helper function to safely set sessionStorage
const setSessionStorageState = (id: string, state: WindowState) => {
  const key = getStorageKey(id);
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, state);
    }
  } catch (error) {
    console.warn(`sessionStorage is not available for key ${key}:`, error);
  }
};

/**
 * Custom hook to manage window-like state (normal, minimized, maximized, closed)
 * for a specific component instance, with persistence in sessionStorage.
 * @param id - A unique identifier for the component instance.
 * @param initialState - The initial state if none is found in storage (defaults to 'normal').
 */
export function useWindowState(id: string, initialState: WindowState = "normal") {
  // State for the window's current status
  const [windowState, setWindowState] = useState<WindowState>(initialState);
  // State to track if the component has mounted on the client
  const [isMounted, setIsMounted] = useState(false);

  // Effect to simply mark the component as mounted on the client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effect to hydrate the state from sessionStorage *after* mounting
  useEffect(() => {
    // Only attempt to read from storage if we are mounted on the client
    if (isMounted) {
      const storedState = getSessionStorageState(id);
      if (storedState) {
        console.log(`useWindowState (${id}): Hydrating state from sessionStorage: ${storedState}`);
        // Use functional update to avoid needing windowState in dependency array
        setWindowState((prevState) => {
          // Prevent terminal from starting maximized - always start in normal mode
          if (id === "terminal" && storedState === "maximized") {
            console.log(`useWindowState (${id}): Preventing maximized state on load, using normal instead`);
            return "normal";
          }
          // Only update if the stored state is different from the previous state
          return storedState !== prevState ? storedState : prevState;
        });
      }
    }
    // This effect should run only once after mounting to hydrate the initial state.
    // It depends on isMounted and id (in case id changes, though unlikely for a stable component).
    // It should NOT depend on windowState itself, as that could cause loops.
  }, [isMounted, id]); // Removed windowState from dependencies

  // Effect to update sessionStorage when the state changes, but only if mounted
  useEffect(() => {
    // Only write to storage if we are mounted on the client
    if (isMounted) {
      console.log(`useWindowState (${id}): Persisting state to sessionStorage: ${windowState}`);
      setSessionStorageState(id, windowState);
    }
    // This effect runs whenever the state changes *after* the component is mounted
  }, [id, windowState, isMounted]);

  // Define state update handlers - these modify the main windowState
  const closeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Setting state to closed`);
    setWindowState("closed");
  }, [id]); // Dependency array includes id for consistency, though setWindowState is stable

  const minimizeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Setting state to minimized`);
    setWindowState("minimized");
  }, [id]); // Dependency array includes id

  const maximizeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Toggling maximize/normal`);
    setWindowState((prev) => (prev === "maximized" ? "normal" : "maximized"));
  }, [id]); // Dependency array includes id

  // The state returned is always the current `windowState`.
  // On the server, it's `initialState`.
  // On the client, it starts as `initialState`, then potentially updates after hydration.
  const currentState = windowState;

  // Memoize the returned object for performance optimization
  const value = useMemo(
    () => ({
      windowState: currentState,
      setWindowState: setWindowState, // Expose the main state setter
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      // isReady indicates if the component has mounted and hydration attempt occurred
      isReady: isMounted,
    }),
    [currentState, closeWindow, minimizeWindow, maximizeWindow, isMounted],
  );

  return value;
}
