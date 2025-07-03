/**
 * @file Social Window Client Component
 * @module components/features/social/social-window.client
 *
 * @description
 * Client-side window management functionality for the social/contact page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders social content within a window-like UI.
 */

"use client";

import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import type { SocialWindowClientProps } from "@/types/features/social";
import { Users } from "lucide-react";
import { SocialWindowContent } from "./social-window-content.client";
// Define a unique ID for this window instance
const SOCIAL_WINDOW_ID = "social-contact-window";

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */

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

  // Assume mounted – React 18 handles hydration; suppress minor mismatches
  const hasMounted = true;

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
    />
  );
}
