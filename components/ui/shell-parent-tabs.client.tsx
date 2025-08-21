/**
 * @fileoverview
 * This file contains the ShellParentTabs and ShellTab components.
 *
 * The ShellParentTabs component is a wrapper that allows for multiple tabs to be rendered.
 * The ShellTab component is a child component that renders the content for a tab.
 */

"use client";

import { cn } from "@/lib/utils";
import { Children, type JSX, cloneElement, createContext, isValidElement, useId, useState } from "react";
import type { ReactNode } from "react";
import type { ShellTabProps, ShellParentTabsContextProps } from "@/types/ui";

/**
 * Represents a single tab within a ShellParentTabs container.
 * This component primarily serves as a data container for its props (label, children, isDefault)
 * and modifies its children to add styling and context markers.
 * It does not render a visual tab button itself; that's handled by ShellParentTabs.
 *
 * @param {ShellTabProps} props - The props for the component.
 * @param {ReactNode} props.children - The content of the tab.
 * @returns {JSX.Element} A React fragment containing the (potentially modified) children.
 */
export function ShellTab({ children }: ShellTabProps): JSX.Element {
  // Add a marker prop to children that are elements to help identify when they're in ShellTab
  const childrenWithProps = Children.map(children, child => {
    if (isValidElement(child)) {
      // Create properly typed props object
      const props = {
        // Type assertion to allow custom property
        ...(child.props as Record<string, unknown>),
        // Add marker property
        __IS_SHELL_TAB: true,
        // Add properly typed className
        className: cn(
          // Safely access className from props if it exists
          (() => {
            const childProps = child.props as Record<string, unknown>;
            return typeof childProps.className === "string" ? childProps.className : "";
          })(),
          // Ensure links are properly styled in shell tabs
          "[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:font-medium",
          "[&_a:hover]:text-blue-500 [&_a:hover]:dark:text-blue-300 [&_a:hover]:no-underline",
        ),
      };

      return cloneElement(child, props);
    }
    return child;
  });
  return <>{childrenWithProps}</>;
}

/**
 * React context for managing the state of ShellParentTabs.
 * @internal
 */
const ShellTabsContext = createContext<ShellParentTabsContextProps | null>(null);

// We don't need this unused interface
// Removing to fix eslint error

/**
 * A container component that renders a set of tabs and their content.
 * It manages the active tab state and renders the corresponding ShellTab's children.
 *
 * @param {object} props - The props for the component.
 * @param {ReactNode} props.children - Should be one or more ShellTab components.
 * @param {string} [props.className] - Optional CSS class name for the container.
 * @returns {JSX.Element | null} The rendered tabs container or a message if no tabs are configured.
 */
export function ShellParentTabs({ children, className = "" }: { children: ReactNode; className?: string }) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<string>("");

  const tabs = Children.toArray(children)
    .filter(isValidElement)
    .map((child, index) => {
      const childProps = child.props as ShellTabProps;
      const label = childProps.label;
      if (!label) {
        console.warn("ShellTab found without a 'label' prop. It will not be rendered.");
        return null;
      }
      if (childProps.isDefault && !activeTab) {
        setActiveTab(label); // Use label for activeTab state
      }
      // Keep original unique IDs for aria and internal linking
      return { label, id: `${baseId}-tab-${index}` };
    })
    .filter(Boolean) as Array<{ label: string; id: string }>;

  if (!activeTab && tabs.length > 0 && tabs[0]) {
    setActiveTab(tabs[0].label); // Set activeTab to the first tab's label
  }

  if (tabs.length === 0) {
    return (
      <div className="my-4 p-4 border border-red-500 rounded-md bg-red-50 text-red-700">
        No tabs configured for ShellParentTabs. Please add one or more ShellTab components with a label.
      </div>
    );
  }

  return (
    <ShellTabsContext.Provider value={{ activeTab, setActiveTab, tabs, baseId }}>
      <div className={cn("my-5 overflow-hidden max-w-full w-full", className)}>
        {/* Shell parent tab navigation (no macOS traffic lights here) */}
        <div
          className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 rounded-t-lg"
          role="tablist"
        >
          {tabs.map(tab => (
            <button
              type="button"
              key={tab.label} // Use label as key
              role="tab"
              aria-selected={activeTab === tab.label} // Compare with label
              aria-controls={`${tab.id}-panel`} // Use unique generated id for ARIA
              id={`${tab.id}-button`} // Use unique generated id for ARIA
              onClick={() => setActiveTab(tab.label)} // Set activeTab by label
              className={cn(
                "px-4 py-2.5 text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0",
                activeTab === tab.label
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400 bg-white dark:bg-gray-700/50"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bg-white dark:bg-gray-900 relative group p-4">
          {Children.toArray(children).map(child => {
            if (isValidElement(child)) {
              const shellTabChildProps = child.props as ShellTabProps;
              if (shellTabChildProps.label === activeTab) {
                const tabInfo = tabs.find(t => t.label === shellTabChildProps.label);

                return (
                  <div
                    key={shellTabChildProps.label}
                    role="tabpanel"
                    id={`${tabInfo?.id}-panel`} // Use unique generated id
                    aria-labelledby={`${tabInfo?.id}-button`} // Use unique generated id
                    className="tab-content w-full relative prose dark:prose-invert"
                  >
                    {shellTabChildProps.children} {/* Render original children */}
                  </div>
                );
              }
            }
            return null;
          })}
        </div>
      </div>
    </ShellTabsContext.Provider>
  );
}
