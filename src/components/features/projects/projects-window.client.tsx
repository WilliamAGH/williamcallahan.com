/**
 * @file Projects Window Client Component
 * @module components/features/projects/projects-window.client
 *
 * @description
 * Client-side window management functionality for the projects page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders server-rendered content within a window-like UI.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

"use client";

import React, { Suspense, useEffect } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { TerminalSearchHint } from "@/components/ui/terminal/terminal-search-hint";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import type { ProjectsWindowClientProps } from "@/types/features/projects";
import { FolderKanban } from "lucide-react";
import dynamic from "next/dynamic";
import { ProjectsListServer } from "./projects-list.client";
import { useSearchParams } from "next/navigation";

// Define a unique ID for this window instance
const PROJECTS_WINDOW_ID = "projects-window";

/**
 * Inner content component – separated so we can hand it to `dynamic()` as the default export
 * without creating a new file. Returning an object with a `default` key satisfies Next.js/webpack.
 */
function ProjectsWindowContentInner({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  title,
}: {
  children: React.ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  title: string;
}): React.JSX.Element {
  const isMaximized = windowState === "maximized";

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40"
          : "relative max-w-5xl mx-auto mt-8",
      )}
    >
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
            <h1 className="text-xl font-mono ml-4">~/{title.toLowerCase().replace(/\s+/g, "-")}</h1>
          </div>
          <TerminalSearchHint context="projects" />
        </div>
      </div>

      <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
        <Suspense
          fallback={
            <div className="animate-pulse space-y-4 p-6">
              {Array.from({ length: 3 }, () => (
                <div
                  key={crypto.randomUUID()}
                  className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg"
                />
              ))}
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Dynamic import of the window content component.
 * SSR is enabled to ensure project IDs are in initial HTML for anchor link support.
 */
const ProjectsWindowContent = dynamic(() =>
  Promise.resolve({ default: ProjectsWindowContentInner }),
);

/**
 * ProjectsWindow Client Component
 *
 * Renders server-side generated content within a window-like UI that
 * supports minimizing, maximizing, and closing.
 *
 * @param {ProjectsWindowProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function ProjectsWindow({
  title = "Projects",
  onClose,
  onMinimize,
  onMaximize,
}: ProjectsWindowClientProps) {
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  } = useRegisteredWindowState(PROJECTS_WINDOW_ID, FolderKanban, title, "normal");

  // Use provided handlers or fall back to internal handlers
  const handleClose = onClose || closeWindow;
  const handleMinimize = onMinimize || minimizeWindow;
  const handleMaximize = onMaximize || maximizeWindow;

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      console.log(`ProjectsWindow Render (${PROJECTS_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]);

  // Render nothing until ready
  if (!isRegistered) {
    return null;
  }

  // Handle closed state
  if (windowState === "closed") {
    return null;
  }

  // Handle minimized state
  if (windowState === "minimized") {
    return null;
  }

  return (
    <ProjectsWindowContent
      windowState={windowState}
      onClose={handleClose}
      onMinimize={handleMinimize}
      onMaximize={handleMaximize}
      title={title}
    >
      {/* Server-rendered list */}
      <ProjectsListServer />
      {/* Client-side filter to toggle visibility based on ?tag= */}
      <TagVisibilityController />
    </ProjectsWindowContent>
  );
}

/**
 * Client component that toggles visibility of project elements rendered by
 * ProjectsListServer.  Each element has `data-project-tags` set to a space-
 * separated list.  No DOM is mutated beyond display style, so hydration stays
 * consistent.
 */
function TagVisibilityController() {
  return (
    <Suspense fallback={null}>
      <TagVisibilityControllerContent />
    </Suspense>
  );
}

function TagVisibilityControllerContent() {
  const params = useSearchParams();
  const rawTag = params?.get("tag");
  const selectedTag = rawTag ? rawTag.replace(/\+/g, " ") : "All";

  React.useEffect(() => {
    const projectNodes = document.querySelectorAll<HTMLElement>("[data-project-tags]");
    projectNodes.forEach((node) => {
      const tags = node.getAttribute("data-project-tags")?.split("|||") ?? [];
      const shouldShow = selectedTag === "All" || tags.includes(selectedTag);
      node.style.display = shouldShow ? "" : "none";
    });
  }, [selectedTag]);

  return null; // renders nothing
}
