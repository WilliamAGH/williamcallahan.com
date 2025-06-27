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

import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import type { SocialWindowClientProps } from "@/types/features/social";
import { Users } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
// Define a unique ID for this window instance
const SOCIAL_WINDOW_ID = "social-contact-window";

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */
const SocialWindowContent = dynamic<import("@/types/features/social").SocialWindowContentProps>(
  () => import("./social-window-content.client").then((m) => m.SocialWindowContent),
  { ssr: false },
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
export function SocialWindow({ data, title = "Contact", onClose }: SocialWindowClientProps) {
  void data; // param currently unused but kept for future use

  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  } = useRegisteredWindowState(SOCIAL_WINDOW_ID, Users, title, "normal");

  // Use provided handler or fall back to internal handler
  const handleClose = onClose || closeWindow;

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
      if (process.env.NODE_ENV === "development") {
        console.log(`SocialWindow Render (${SOCIAL_WINDOW_ID}) - Window State:`, windowState);
      }
    }
  }, [windowState, isRegistered, hasMounted]);

  // Use a consistent skeleton for non-mounted state
  if (!hasMounted) {
    return (
      <div
        className="relative max-w-5xl mx-auto mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden h-[600px]"
        suppressHydrationWarning
      />
    );
  }

  // Handle registration/state changes only when mounted
  if (!isRegistered || windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <SocialWindowContent
      windowState={windowState}
      onClose={handleClose}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      hasMounted={hasMounted}
    >
      <span className="sr-only">empty</span>
    </SocialWindowContent>
  );
}
