/**
 * use-window-state.ts
 *
 * Custom hook to manage window-like state (normal, minimized, maximized, closed)
 * for a specific component instance, with persistence in sessionStorage.
 *
 */

"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { WindowStateValue } from "@/types/ui/window";

// Helper to generate storage key
const getStorageKey = (id: string): string => `windowState-${id}`;

// Helper function to safely access sessionStorage
const getSessionStorageState = (id: string): WindowStateValue | null => {
  const key = getStorageKey(id);
  try {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(key) as WindowStateValue | null;
    }
  } catch (error) {
    console.warn(`sessionStorage is not available for key ${key}:`, error);
  }
  return null;
};

// Helper function to safely set sessionStorage
const setSessionStorageState = (id: string, state: WindowStateValue) => {
  const key = getStorageKey(id);
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, state);
    }
  } catch (error) {
    console.warn(`sessionStorage is not available for key ${key}:`, error);
  }
};

const subscribeToNothing = (): (() => void) => () => undefined;
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

// Reads the persisted state for hydration; the terminal never restores maximized.
const readHydratedState = (id: string): WindowStateValue | null => {
  const storedState = getSessionStorageState(id);
  if (!storedState) return null;
  if (id === "terminal" && storedState === "maximized") {
    console.log(`useWindowState (${id}): Preventing maximized state on load, using normal instead`);
    return "normal";
  }
  console.log(`useWindowState (${id}): Hydrating state from sessionStorage: ${storedState}`);
  return storedState;
};

/**
 * Custom hook to manage window-like state (normal, minimized, maximized, closed)
 * for a specific component instance, with persistence in sessionStorage.
 * @param id - A unique identifier for the component instance.
 * @param initialState - The initial state if none is found in storage (defaults to 'normal').
 */
export function useWindowState(id: string, initialState: WindowStateValue = "normal") {
  // False on the server and during hydration, true afterwards, so SSR markup matches.
  const isMounted = useSyncExternalStore(subscribeToNothing, getClientSnapshot, getServerSnapshot);
  const hydratedState = useMemo(() => (isMounted ? readHydratedState(id) : null), [isMounted, id]);
  // A state the user selected overrides the hydrated one.
  const [selectedState, setSelectedState] = useState<WindowStateValue | null>(null);
  const windowState = selectedState ?? hydratedState ?? initialState;

  // Effect to update sessionStorage when the state changes, but only if mounted
  useEffect(() => {
    // Only write to storage if we are mounted on the client
    if (isMounted) {
      console.log(`useWindowState (${id}): Persisting state to sessionStorage: ${windowState}`);
      setSessionStorageState(id, windowState);
    }
    // This effect runs whenever the state changes *after* the component is mounted
  }, [id, windowState, isMounted]);

  const setWindowState = useCallback((state: WindowStateValue) => {
    setSelectedState(state);
  }, []);

  const closeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Setting state to closed`);
    setSelectedState("closed");
  }, [id]);

  const minimizeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Setting state to minimized`);
    setSelectedState("minimized");
  }, [id]);

  const maximizeWindow = useCallback(() => {
    console.log(`useWindowState (${id}): Toggling maximize/normal`);
    setSelectedState(windowState === "maximized" ? "normal" : "maximized");
  }, [id, windowState]);

  // Memoize the returned object for performance optimization
  const value = useMemo(
    () => ({
      windowState,
      setWindowState,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      // isReady indicates if the component has mounted and hydration attempt occurred
      isReady: isMounted,
    }),
    [windowState, setWindowState, closeWindow, minimizeWindow, maximizeWindow, isMounted],
  );

  return value;
}
