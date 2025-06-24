/**
 * Context for managing the state of multiple window-like components.
 * Tracks the state (normal, minimized, maximized, closed) and associated icon
 * for each registered window component, identified by a unique ID.
 */

"use client";

import { useFixSvgTransforms } from "@/hooks/use-fix-svg-transforms";
import type { LucideIcon } from "lucide-react"; // Assuming lucide-react for icons
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  WindowStateValue,
  WindowInstanceInfo,
  GlobalWindowRegistryContextType,
  GlobalWindowRegistryProviderProps,
  RegisteredWindowState,
} from "@/types/ui/window";

// Create the context
const GlobalWindowRegistryContext = createContext<GlobalWindowRegistryContextType | undefined>(undefined);

// Define the provider component
export const GlobalWindowRegistryProvider = ({ children }: GlobalWindowRegistryProviderProps) => {
  const [windows, setWindows] = useState<Record<string, WindowInstanceInfo>>({});

  const registerWindow = useCallback(
    (id: string, icon: LucideIcon, title: string, initialState: WindowStateValue = "normal") => {
      // Registration logging removed to keep development console clean
      setWindows((prev) => {
        // Avoid re-registering if already present with the same info
        // Don't compare icon since React components are recreated on each render
        if (prev[id] && prev[id].state === initialState && prev[id].title === title) {
          return prev;
        }
        return {
          ...prev,
          [id]: { id, state: initialState, icon, title },
        };
      });
    },
    [],
  );

  const unregisterWindow = useCallback((id: string) => {
    setWindows((prev) => {
      // Destructure to get all windows except the one we're removing
      const { [id]: removedWindow, ...rest } = prev; // Extract removed window for cleanup
      void removedWindow; // Explicitly acknowledge unused variable
      return rest;
    });
    // TODO: Consider removing from sessionStorage on unregister?
  }, []);

  const setWindowState = useCallback((id: string, state: WindowStateValue) => {
    setWindows((prev) => {
      if (!prev[id] || prev[id].state === state) return prev; // No change needed
      // TODO: Persist to sessionStorage here?
      return { ...prev, [id]: { ...prev[id], state } };
    });
  }, []);

  const minimizeWindow = useCallback((id: string) => setWindowState(id, "minimized"), [setWindowState]);
  const closeWindow = useCallback((id: string) => setWindowState(id, "closed"), [setWindowState]);
  const restoreWindow = useCallback((id: string) => setWindowState(id, "normal"), [setWindowState]);

  const maximizeWindow = useCallback((id: string) => {
    setWindows((prev) => {
      if (!prev[id]) return prev;
      const newState = prev[id].state === "maximized" ? "normal" : "maximized";
      // TODO: Persist to sessionStorage here?
      return { ...prev, [id]: { ...prev[id], state: newState } };
    });
  }, []);

  const getWindowState = useCallback(
    (id: string): WindowInstanceInfo | undefined => {
      return windows[id];
    },
    [windows],
  );

  // Memoize context value
  const value = useMemo(
    () => ({
      windows,
      registerWindow,
      unregisterWindow,
      setWindowState,
      minimizeWindow,
      maximizeWindow,
      closeWindow,
      restoreWindow,
      getWindowState,
    }),
    [
      windows,
      registerWindow,
      unregisterWindow,
      setWindowState,
      minimizeWindow,
      maximizeWindow,
      closeWindow,
      restoreWindow,
      getWindowState,
    ],
  );

  // Add ref to fix SVG transforms
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the hook to fix SVG transforms
  useFixSvgTransforms({ rootRef: containerRef });

  return (
    <GlobalWindowRegistryContext.Provider value={value}>
      <div ref={containerRef}>{children}</div>
    </GlobalWindowRegistryContext.Provider>
  );
};

// Define custom hook for easy consumption
export const useWindowRegistry = (): GlobalWindowRegistryContextType => {
  const context = useContext(GlobalWindowRegistryContext);
  if (context === undefined) {
    throw new Error("useWindowRegistry must be used within a GlobalWindowRegistryProvider");
  }
  return context;
};

// Optional: Hook specifically for a single window instance to simplify component usage
// This hook handles registration/unregistration automatically
export const useRegisteredWindowState = (
  id: string,
  icon: LucideIcon,
  title: string,
  initialState: WindowStateValue = "normal",
): RegisteredWindowState => {
  const {
    windows,
    registerWindow,
    unregisterWindow,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    restoreWindow,
    setWindowState,
  } = useWindowRegistry();

  useEffect(() => {
    registerWindow(id, icon, title, initialState);

    return () => {
      unregisterWindow(id);
    };
  }, [id, icon, title, initialState, registerWindow, unregisterWindow]);

  const windowInfo = windows[id];

  // Return state and actions specific to this ID
  return useMemo(
    () => ({
      windowState: windowInfo?.state ?? initialState, // Fallback to the provided initial state until registration finishes
      minimize: () => minimizeWindow(id),
      maximize: () => maximizeWindow(id),
      close: () => closeWindow(id),
      restore: () => restoreWindow(id),
      setState: (state: WindowStateValue) => setWindowState(id, state),
      isRegistered: Boolean(windowInfo),
    }),
    [id, windowInfo, initialState, minimizeWindow, maximizeWindow, closeWindow, restoreWindow, setWindowState],
  );
};
