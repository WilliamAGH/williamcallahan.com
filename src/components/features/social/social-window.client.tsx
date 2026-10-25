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
  } = useRegisteredWindowState(SOCIAL_WINDOW_ID, Users, title, "normal");

  // Use provided handler or fall back to internal handler
  const handleClose = onClose || closeWindow;

  // The hook supplies the normal initial state before effect-based registration.
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <SocialWindowContent
      windowState={windowState}
      onClose={handleClose}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      hasMounted
    />
  );
}
