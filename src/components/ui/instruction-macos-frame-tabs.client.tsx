/**
 * @file Client components for rendering macOS-style tabbed windows.
 * Provides InstructionMacOSFrameTabs as the main tab container and InstructionMACOSTab for individual tabs.
 * Includes context for managing tab state and interactions like close, minimize, and maximize.
 */

"use client";

// import type { ReactNode, ReactElement } from 'react'; // Combined into the line above
import { cn } from "@/lib/utils";
import React, {
  type JSX,
  Children,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"; // Removed unused type FC
import { CollapseDropdown } from "./collapse-dropdown.client";
import { MacOSWindow, type WindowTab } from "./macos-window.client";
import { WindowControls } from "./navigation/window-controls";
import type {
  InstructionMACOSTabProps,
  InstructionMacOSFrameTabsProps,
  InstructionMacOSFrameTabsContextProps,
} from "@/types/ui";

/**
 * Context to track when we're inside a macOS frame to prevent double nesting
 */
const MacOSFrameContext = createContext<boolean>(false);

/**
 * Export the context for use in other components
 */
export { MacOSFrameContext };

/**
 * Represents an individual tab within an InstructionMacOSFrameTabs container.
 * This component primarily serves as a data container for its props and applies styling context.
 * The actual tab button rendering is handled by the parent InstructionMacOSFrameTabs component.
 *
 * @param {InstructionMACOSTabProps} props - The props for the tab.
 * @returns {JSX.Element} A React fragment containing the children with added context properties.
 */
export function InstructionMACOSTab({ children }: InstructionMACOSTabProps): JSX.Element {
  const childrenWithProps = Children.map(children, childNode => {
    if (!React.isValidElement(childNode)) {
      return childNode;
    }
    const currentProps = childNode.props as { className?: string; [key: string]: unknown };
    const newProps = {
      ...currentProps,
      __IS_MACOS_FRAME_TAB: true,
      className: cn(
        currentProps.className,
        "[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:font-medium",
        "[&_a:hover]:text-blue-500 [&_a:hover]:dark:text-blue-300 [&_a:hover]:no-underline",
      ),
    };
    return React.cloneElement(childNode as React.ReactElement<unknown>, newProps);
  });
  return <>{childrenWithProps}</>;
}

/**
 * React context for managing the state of InstructionMacOSFrameTabs.
 * This context provides descendant components with information about the active tab
 * and a function to change the active tab.
 * @internal This context is not intended for direct external use.
 */
const InstructionMacOSFrameTabsContext = createContext<InstructionMacOSFrameTabsContextProps | null>(null);

/**
 * A component that renders a macOS-style window with tabbed navigation.
 * It manages the active tab, window visibility (close), and window states (minimize, maximize).
 * Children should be {@link InstructionMACOSTab} components.
 *
 * @param {InstructionMacOSFrameTabsProps} props - The props for the component.
 * @returns {JSX.Element | null} The rendered tabbed window, a message if no tabs are configured, or null if closed.
 */
export function InstructionMacOSFrameTabs({
  children,
  className = "",
}: InstructionMacOSFrameTabsProps): JSX.Element | null {
  const baseId = useId(); // Unique ID for ARIA attributes
  const [activeTabLabel, setActiveTabLabel] = useState<string | null>(null); // Label of the currently active tab

  // Window state for InstructionMacOSFrameTabs itself
  const [isVisible, setIsVisible] = useState(true); // Whether the window is currently visible
  const [isMinimized, setIsMinimized] = useState(false); // Whether the window is minimized
  const [isMaximized, setIsMaximized] = useState(false); // Whether the window is maximized
  const windowRef = useRef<HTMLDivElement>(null); // Ref to the window for click-outside detection when maximized

  /** Toggles the visibility of the window. */
  const handleClose = useCallback(() => setIsVisible(prev => !prev), []);

  /** Toggles the minimized state of the window. Un-maximizes if currently maximized. */
  const handleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
    if (isMaximized) setIsMaximized(false); // Cannot be minimized and maximized simultaneously
  }, [isMaximized]);

  /** Toggles the maximized state of the window. Un-minimizes if currently minimized. */
  const handleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false); // Cannot be maximized and minimized simultaneously
  }, [isMinimized]);

  // Effect for handling Escape key to un-maximize and click outside to un-maximize.
  useEffect(() => {
    // Only attach listeners when maximized
    if (!isMaximized) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleMaximize();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (windowRef.current && !windowRef.current.contains(event.target as Node)) {
        handleMaximize();
      }
    };

    // Add event listeners
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    // Cleanup function ensures listeners are always removed
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMaximized, handleMaximize]);

  const instructionTabs = Children.toArray(children)
    .filter(React.isValidElement)
    .map((child, index) => {
      // Use renamed prop type
      const childProps = child.props as InstructionMACOSTabProps;
      const label = childProps.label;
      if (!label) {
        console.warn("InstructionMACOSTab found without a 'label' prop. It will not be rendered.");
        return null;
      }
      return {
        label,
        id: `${baseId}-tab-${index}`,
        isDefault: childProps.isDefault,
        originalChild: child as ReactElement<InstructionMACOSTabProps>,
      };
    })
    .filter(Boolean) as Array<{
    label: string;
    id: string;
    isDefault?: boolean;
    originalChild: ReactElement<InstructionMACOSTabProps>;
  }>;

  // Set the default tab after the tabs are processed, but outside the render cycle
  useEffect(() => {
    if (activeTabLabel === null && instructionTabs.length > 0) {
      // Prefer an explicitly-marked default, otherwise first tab
      const defaultTab = instructionTabs.find(t => t.isDefault) ?? instructionTabs[0];
      if (defaultTab) setActiveTabLabel(defaultTab.label);
    }
  }, [activeTabLabel, instructionTabs]);

  if (instructionTabs.length === 0) {
    return (
      <div className="my-4 p-4 border border-red-500 rounded-md bg-red-50 text-red-700">
        No tabs configured. Please add one or more InstructionMACOSTab components.
      </div>
    );
  }

  const windowTabs: WindowTab[] = instructionTabs.map(it => ({
    id: it.label,
    label: it.label,
  }));

  // Process activeChildContent to open CollapseDropdowns
  const activeTabDetails = activeTabLabel ? instructionTabs.find(it => it.label === activeTabLabel) : undefined;
  let activeChildContentProcessed: ReactNode = null;

  if (activeTabDetails) {
    const originalContent = activeTabDetails.originalChild.props.children;
    activeChildContentProcessed = React.Children.map(originalContent, (child, index) => {
      if (React.isValidElement(child) && child.type === CollapseDropdown) {
        const collapseDropdownElement = child as ReactElement<React.ComponentProps<typeof CollapseDropdown>>;

        let keyPart: string | number = index; // Default to index
        if (collapseDropdownElement.props.id) {
          keyPart = collapseDropdownElement.props.id;
        } else if (typeof collapseDropdownElement.props.summary === "string") {
          // Create a simple, more reliable key from string summary
          keyPart = collapseDropdownElement.props.summary
            .substring(0, 30)
            .replace(/[^a-zA-Z0-9]/g, "-")
            .toLowerCase();
        } else {
          // If summary is not a string and no id, rely on index passed through keyPart
        }

        return React.cloneElement(collapseDropdownElement, {
          defaultOpen: true,
          key: `${activeTabLabel}-dropdown-${keyPart}`,
        });
      }
      return child;
    });
  }

  if (!isVisible) {
    return (
      <div className={cn("my-5 flex justify-center", className)}>
        <button
          type="button"
          className="flex items-center bg-[#2E2E2E] dark:bg-[#1a1b26] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer"
          onClick={handleClose}
          aria-label="Show content"
        >
          <WindowControls
            onClose={handleClose}
            // Disable minimize and maximize when window is hidden
            onMinimize={undefined}
            onMaximize={undefined}
            isMaximized={false}
            size="md"
          />
          <span className="ml-2 text-xs text-gray-300 dark:text-gray-400">Content hidden (click to show)</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={windowRef}
      className={cn(
        isMaximized && "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8",
        className, // Allow external classes to be merged
      )}
    >
      <InstructionMacOSFrameTabsContext.Provider
        value={{
          activeTab: activeTabLabel,
          setActiveTab: setActiveTabLabel,
          tabs: instructionTabs.map(t => ({ label: t.label, id: t.id })),
          baseId,
        }}
      >
        <MacOSWindow
          className={cn(
            "!my-0 !border-0 !shadow-none !rounded-none",
            isMaximized && "w-full max-w-[95vw] sm:max-w-5xl max-h-[90vh] sm:max-h-[80vh] flex flex-col",
            !isMaximized && className,
          )}
          tabs={windowTabs}
          activeTabId={activeTabLabel || ""}
          onTabClick={tabId => setActiveTabLabel(tabId)}
          clipContent={false}
          contentClassName={cn(
            "bg-gray-100 dark:bg-gray-800",
            "text-gray-900 dark:text-gray-100",
            "p-2",
            "text-xs",
            isMaximized && "flex-1 overflow-auto",
            isMinimized && "hidden",
          )}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          isMaximized={isMaximized}
        >
          <MacOSFrameContext.Provider value={true}>
            {!isMinimized && activeChildContentProcessed} {/* Render processed content only if not minimized */}
          </MacOSFrameContext.Provider>
        </MacOSWindow>
      </InstructionMacOSFrameTabsContext.Provider>
    </div>
  );
}

// ShellTab and ShellParentTabs remain unchanged below if they are in the same file.
// Assuming they are, no changes needed for them. If they are separate, this change is self-contained to InstructionMacOSFrameTabs.
