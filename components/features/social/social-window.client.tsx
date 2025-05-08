"use client";

/**
 * @file Social Window Client Component
 * @module components/features/social/social-window.client
 *
 * @description
 * Client-side window management functionality for the social/contact page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders social content within a window-like UI.
 */

import { useEffect, Suspense, useState } from 'react';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { ClientBoundaryProps } from '@/types/component-types';
import { SocialListClient } from './social-list.client';

// Define a unique ID for this window instance
const SOCIAL_WINDOW_ID = 'social-contact-window';

/**
 * Props for the SocialWindow component
 */
interface SocialWindowProps extends ClientBoundaryProps {
  /**
   * Content to be displayed within the window
   */
  children: React.ReactNode;
}

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */
const SocialWindowContent = dynamic(
  () => Promise.resolve(({ children, windowState, onClose, onMinimize, onMaximize, hasMounted }: {
    children: React.ReactNode;
    windowState: string;
    onClose: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
    hasMounted: boolean;
  }) => {
    // If not mounted yet, return a skeleton with the exact same structure
    if (!hasMounted) {
      return (
        <div className="relative max-w-5xl mx-auto mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden h-[600px]" suppressHydrationWarning />
      );
    }

    const isMaximized = windowState === 'maximized';

    return (
      <div
        className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          // Maximize: Use fixed positioning, take full screen except header/footer space
          isMaximized
            ? 'fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40'
            // Normal: Default flow, maybe some margin
            : 'relative max-w-5xl mx-auto mt-8'
        )}
      >
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
          <div className="flex items-center">
            <WindowControls
              onClose={onClose}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
            />
            <h1 className="text-xl font-mono ml-4">~/contact</h1>
          </div>
        </div>

        <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
          <Suspense fallback={
            <div className="animate-pulse space-y-4 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
              ))}
            </div>
          }>
            {children}
            <SocialListClient />
          </Suspense>
        </div>
      </div>
    );
  }),
  { ssr: false }
);

/**
 * SocialWindow Client Component
 *
 * Renders content within a window-like UI that
 * supports minimizing, maximizing, and closing.
 *
 * @param {SocialWindowProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function SocialWindow({ children }: SocialWindowProps) {
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(SOCIAL_WINDOW_ID, Users, 'Restore Contact', 'normal');

  // Client-side mounting detection for mobile hydration safety
  const [hasMounted, setHasMounted] = useState(false);

  // Set up mounted state with delay to prevent mobile hydration issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMounted(true);
    }, 20);

    return () => clearTimeout(timer);
  }, []);

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered && hasMounted) {
      // console.log(`SocialWindow Render (${SOCIAL_WINDOW_ID}) - Window State:`, windowState);
      if (process.env.NODE_ENV === 'development') {
        console.log(`SocialWindow Render (${SOCIAL_WINDOW_ID}) - Window State:`, windowState);
      }
    }
  }, [windowState, isRegistered, hasMounted]);

  // Use a consistent skeleton for non-mounted state
  if (!hasMounted) {
    return (
      <div className="relative max-w-5xl mx-auto mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden h-[600px]" suppressHydrationWarning />
    );
  }

  // Handle registration/state changes only when mounted
  if (!isRegistered || windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <SocialWindowContent
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      hasMounted={hasMounted}
    >
      {children}
    </SocialWindowContent>
  );
}