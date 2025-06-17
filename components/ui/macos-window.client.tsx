/**
 * @fileoverview
 * This file contains the MacOSWindow and MacOSCodeWindow components.
 *
 * The MacOSWindow component is a wrapper that renders a macOS-style window.
 * The MacOSCodeWindow component is a specialized component that renders a code window.
 */

"use client";

import { CodeBlock } from "@/components/ui/code-block/code-block.client";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Define the interface for a single tab
export interface WindowTab {
  id: string;
  label: string;
}

interface MacOSWindowProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  hideTrafficLights?: boolean;
  title?: string;
  tabs?: WindowTab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  // To control traffic light appearance more granularly if needed later
  showTrafficLights?: boolean;
  // Add window control handlers
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean; // Already used by InstructionMacOSFrameTabs, ensure it's here
}

export function MacOSWindow({
  children,
  className = "",
  contentClassName = "",
  title,
  tabs,
  activeTabId,
  onTabClick,
  // Default to showing traffic lights if not explicitly hidden
  showTrafficLights = true,
  // Retain hideTrafficLights for backward compatibility if used, but prefer showTrafficLights
  hideTrafficLights,
  // Destructure new props
  onClose,
  onMinimize,
  onMaximize,
  isMaximized, // Already used by InstructionMacOSFrameTabs
}: MacOSWindowProps) {
  // Determine if traffic lights should be shown
  const displayTrafficLights =
    hideTrafficLights === undefined ? showTrafficLights : !hideTrafficLights;

  return (
    <div
      className={cn(
        "my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm",
        className,
      )}
    >
      {/* macOS-style window header */}
      <div
        className={cn(
          "flex items-center bg-[#2E2E2E] dark:bg-[#1a1b26] px-3",
          tabs && tabs.length > 0 ? "pt-1.5" : "py-1.5", // Adjust padding if tabs are present
          "rounded-t-lg",
        )}
      >
        {displayTrafficLights && (
          <WindowControls
            onClose={onClose} // Wire up the handlers
            onMinimize={onMinimize}
            onMaximize={onMaximize}
            isMaximized={isMaximized} // Pass isMaximized state
            size="md"
          />
        )}
        {tabs && tabs.length > 0 ? (
          <div
            className={cn(
              "flex items-end space-x-0.5 flex-grow overflow-x-auto pt-1",
              displayTrafficLights ? "" : "ml-3.5", // Add margin if traffic lights are hidden
            )}
            role="tablist"
            aria-label="Window tabs"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabClick?.(tab.id)}
                className={cn(
                  "px-3 py-2 text-xs font-medium leading-none",
                  "border-b-2",
                  activeTabId === tab.id
                    ? "bg-[#3C3C3C] dark:bg-gray-700/60 text-white dark:text-gray-100 border-blue-500 dark:border-blue-400 rounded-t"
                    : "text-gray-400 dark:text-gray-500 hover:bg-[#383838] dark:hover:bg-gray-700/40 hover:text-gray-200 dark:hover:text-gray-300 border-transparent rounded-t",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500",
                )}
                role="tab"
                aria-selected={activeTabId === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : title ? (
          <div className="text-sm text-gray-300 dark:text-gray-400 ml-2">{title}</div>
        ) : null}
      </div>

      {/* Window content */}
      <div className={cn("bg-gray-900 text-gray-100 w-full", contentClassName)}>{children}</div>
    </div>
  );
}

// Create a specialized component for code windows
export function MacOSCodeWindow({
  children,
  language,
  className = "",
  contentClassName = "",
  title,
  tabs,
  activeTabId,
  onTabClick,
  showTrafficLights = true,
  hideTrafficLights,
}: {
  children: ReactNode;
  language?: string;
  className?: string;
  contentClassName?: string;
  title?: string;
  tabs?: WindowTab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  showTrafficLights?: boolean;
  hideTrafficLights?: boolean;
}) {
  // Determine if traffic lights should be shown
  const displayTrafficLights =
    hideTrafficLights === undefined ? showTrafficLights : !hideTrafficLights;

  return (
    <MacOSWindow
      className={className}
      title={title}
      tabs={tabs}
      activeTabId={activeTabId}
      onTabClick={onTabClick}
      showTrafficLights={displayTrafficLights}
      contentClassName={cn("!p-0", contentClassName)}
    >
      {typeof children === "string" ? (
        <CodeBlock
          className={cn(language ? `language-${language}` : "", "!my-0 !shadow-none !border-0")}
        >
          {children}
        </CodeBlock>
      ) : (
        <div
          className={cn(
            "p-4 overflow-x-auto font-mono text-[13px] whitespace-pre",
            "custom-scrollbar",
            contentClassName,
          )}
        >
          {children}
        </div>
      )}
    </MacOSWindow>
  );
}
