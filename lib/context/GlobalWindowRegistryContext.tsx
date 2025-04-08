/**
 * Context for managing the state of multiple window-like components.
 * Tracks the state (normal, minimized, maximized, closed) and associated icon
 * for each registered window component, identified by a unique ID.
 */

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react'; // Assuming lucide-react for icons

// Define the possible states (same as before)
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';

// Define the structure for storing state about a single window
interface WindowInstanceInfo {
  id: string;
  state: WindowState;
  icon: LucideIcon; // Component to render as the icon
  title: string; // Title for tooltip/aria-label
}

// Define the shape of the context data
export interface GlobalWindowRegistryContextType { // Add export keyword
  windows: Record<string, WindowInstanceInfo>; // Map of windowId -> state info
  registerWindow: (id: string, icon: LucideIcon, title: string, initialState?: WindowState) => void;
  unregisterWindow: (id: string) => void;
  setWindowState: (id: string, state: WindowState) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void; // Toggles between normal/maximized
  closeWindow: (id: string) => void;
  restoreWindow: (id: string) => void; // Restores to 'normal'
  getWindowState: (id: string) => WindowInstanceInfo | undefined;
}

// Create the context
const GlobalWindowRegistryContext = createContext<GlobalWindowRegistryContextType | undefined>(undefined);

// Define provider props
interface GlobalWindowRegistryProviderProps {
  children: ReactNode;
}

// Define the provider component
export const GlobalWindowRegistryProvider = ({ children }: GlobalWindowRegistryProviderProps) => {
  const [windows, setWindows] = useState<Record<string, WindowInstanceInfo>>({});
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) {
      return;
    }
    // Check states separately
    const isAnyWindowMaximized = Object.values(windows).some(w => w.state === 'maximized');
    const isAnyWindowMinimized = Object.values(windows).some(w => w.state === 'minimized');

    // Manage maximized class
    if (isAnyWindowMaximized) {
      document.body.classList.add('window-maximized');
    } else {
      document.body.classList.remove('window-maximized');
    }

    // Manage minimized class
    if (isAnyWindowMinimized) {
      document.body.classList.add('window-minimized');
    } else {
      document.body.classList.remove('window-minimized');
    }

    // Cleanup MUST remove both potential classes
    return () => {
      if (isMounted) {
        document.body.classList.remove('window-maximized');
        document.body.classList.remove('window-minimized');
      }
    };
  }, [windows, isMounted]);

  const registerWindow = useCallback((id: string, icon: LucideIcon, title: string, initialState: WindowState = 'normal') => {
    console.log(`WindowRegistry: Registering window '${id}' with initial state '${initialState}'`);
    setWindows(prev => {
      // Avoid re-registering if already present with the same info
      if (prev[id] && prev[id].state === initialState && prev[id].icon === icon) {
        return prev;
      }
      // TODO: Add logic here to potentially restore from sessionStorage if needed, like in useWindowState
      return {
        ...prev,
        [id]: { id, state: initialState, icon, title },
      };
    });
  }, []);

  const unregisterWindow = useCallback((id: string) => {
     console.log(`WindowRegistry: Unregistering window '${id}'`);
    setWindows(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    // TODO: Consider removing from sessionStorage on unregister?
  }, []);

  const setWindowState = useCallback((id: string, state: WindowState) => {
    setWindows(prev => {
      if (!prev[id] || prev[id].state === state) return prev; // No change needed
      console.log(`WindowRegistry: Setting state for '${id}' to '${state}'`);
      // TODO: Persist to sessionStorage here?
      return { ...prev, [id]: { ...prev[id], state } };
    });
  }, []);

  const minimizeWindow = useCallback((id: string) => setWindowState(id, 'minimized'), [setWindowState]);
  const closeWindow = useCallback((id: string) => setWindowState(id, 'closed'), [setWindowState]);
  const restoreWindow = useCallback((id: string) => setWindowState(id, 'normal'), [setWindowState]);

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      if (!prev[id]) return prev;
      const newState = prev[id].state === 'maximized' ? 'normal' : 'maximized';
      console.log(`WindowRegistry: Toggling state for '${id}' to '${newState}'`);
       // TODO: Persist to sessionStorage here?
      return { ...prev, [id]: { ...prev[id], state: newState } };
    });
  }, []);

  const getWindowState = useCallback((id: string): WindowInstanceInfo | undefined => {
    return windows[id];
  }, [windows]);

  // Memoize context value
  const value = useMemo(() => ({
    windows,
    registerWindow,
    unregisterWindow,
    setWindowState,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    restoreWindow,
    getWindowState,
  }), [windows, registerWindow, unregisterWindow, setWindowState, minimizeWindow, maximizeWindow, closeWindow, restoreWindow, getWindowState]);

  return (
    <GlobalWindowRegistryContext.Provider value={value}>
      {children}
    </GlobalWindowRegistryContext.Provider>
  );
};

// Define custom hook for easy consumption
export const useWindowRegistry = (): GlobalWindowRegistryContextType => {
  const context = useContext(GlobalWindowRegistryContext);
  if (context === undefined) {
    throw new Error('useWindowRegistry must be used within a GlobalWindowRegistryProvider');
  }
  return context;
};

// Optional: Hook specifically for a single window instance to simplify component usage
// This hook handles registration/unregistration automatically
export const useRegisteredWindowState = (id: string, icon: LucideIcon, title: string, initialState: WindowState = 'normal') => {
  const {
    windows,
    registerWindow,
    unregisterWindow,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    restoreWindow,
    setWindowState
   } = useWindowRegistry();

   // Register on mount, unregister on unmount
   useEffect(() => {
     registerWindow(id, icon, title, initialState);
     return () => unregisterWindow(id);
     // Ensure dependencies cover potential changes that require re-registration
   }, [registerWindow, unregisterWindow, id, icon, title, initialState]);

   const windowInfo = windows[id];

   // Return state and actions specific to this ID
   return useMemo(() => ({
     windowState: windowInfo?.state ?? initialState, // Provide default state before registration completes
     isRegistered: !!windowInfo, // Flag indicating if registration is complete
     minimize: () => minimizeWindow(id),
     maximize: () => maximizeWindow(id),
     close: () => closeWindow(id),
     restore: () => restoreWindow(id),
     setState: (state: WindowState) => setWindowState(id, state),
   }), [id, windowInfo, initialState, minimizeWindow, maximizeWindow, closeWindow, restoreWindow, setWindowState]);
 };
