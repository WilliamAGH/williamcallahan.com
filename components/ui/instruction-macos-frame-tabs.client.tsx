'use client';

import React from 'react';
import { useState, createContext, Children, useId, useCallback, useEffect, useRef } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { MacOSWindow, type WindowTab } from './macos-window.client';
import { WindowControls } from './navigation/window-controls';
import { CollapseDropdown } from './collapse-dropdown.client';

// Renamed interface
interface InstructionMACOSTabProps {
  label: string;
  children: ReactNode;
  isDefault?: boolean;
}

// Renamed component
export function InstructionMACOSTab({ children }: InstructionMACOSTabProps): ReactElement {
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
        "[&_a:hover]:text-blue-500 [&_a:hover]:dark:text-blue-300 [&_a:hover]:no-underline"
      ),
    };
    return React.cloneElement(childNode as React.ReactElement<unknown>, newProps);
  });
  return <>{childrenWithProps}</>;
}

// Renamed interface for context props
interface InstructionMacOSFrameTabsContextProps {
  activeTab: string;
  setActiveTab: (label: string) => void;
  tabs: Array<{ label: string; id: string }>;
  baseId: string;
}

// Renamed context object
const InstructionMacOSFrameTabsContext = createContext<InstructionMacOSFrameTabsContextProps | null>(null);

// Renamed main component
export function InstructionMacOSFrameTabs({ children, className = '' }: { children: ReactNode, className?: string }) {
  const baseId = useId();
  const [activeTabLabel, setActiveTabLabel] = useState<string>('');

  // Window state for InstructionMacOSFrameTabs itself
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null); // For maximized click outside

  const handleClose = useCallback(() => setIsVisible(prev => !prev), []);
  const handleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
    if (isMaximized) setIsMaximized(false);
  }, [isMaximized]);
  const handleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false);
  }, [isMinimized]);

  // Effect for handling Escape key and click outside when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMaximized) {
        handleMaximize();
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (isMaximized && windowRef.current && !windowRef.current.contains(event.target as Node)) {
        handleMaximize();
      }
    };
    if (isMaximized) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
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
      if (childProps.isDefault && !activeTabLabel) {
        setActiveTabLabel(label);
      }
      return {
        label,
        id: `${baseId}-tab-${index}`,
        isDefault: childProps.isDefault,
        originalChild: child as ReactElement<InstructionMACOSTabProps>
      };
    })
    .filter(Boolean) as Array<{
      label: string;
      id: string;
      isDefault?: boolean;
      originalChild: ReactElement<InstructionMACOSTabProps>
    }>;

  if (!activeTabLabel && instructionTabs.length > 0) {
    setActiveTabLabel(instructionTabs[0].label);
  }

  if (instructionTabs.length === 0) {
    return <div className="my-4 p-4 border border-red-500 rounded-md bg-red-50 text-red-700">No tabs configured. Please add one or more InstructionMACOSTab components.</div>;
  }

  const windowTabs: WindowTab[] = instructionTabs.map(it => ({
    id: it.label,
    label: it.label,
  }));

  // Process activeChildContent to open CollapseDropdowns
  const activeTabDetails = instructionTabs.find(it => it.label === activeTabLabel);
  let activeChildContentProcessed: ReactNode = null;

  if (activeTabDetails) {
    const originalContent = activeTabDetails.originalChild.props.children;
    activeChildContentProcessed = React.Children.map(originalContent, (child, index) => {
      if (React.isValidElement(child) && child.type === CollapseDropdown) {
        const collapseDropdownElement = child as ReactElement<React.ComponentProps<typeof CollapseDropdown>>;

        let keyPart: string | number = index; // Default to index
        if (collapseDropdownElement.props.id) {
          keyPart = collapseDropdownElement.props.id;
        } else if (typeof collapseDropdownElement.props.summary === 'string') {
          // Create a simple, more reliable key from string summary
          keyPart = collapseDropdownElement.props.summary.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        } else {
          // If summary is not a string and no id, rely on index passed through keyPart
        }

        return React.cloneElement(collapseDropdownElement, {
          defaultOpen: true,
          key: `${activeTabLabel}-dropdown-${keyPart}`
        });
      }
      return child;
    });
  }

  if (!isVisible) {
    return (
      <div className={cn("my-5 flex justify-center", className)}>
        <div
          className="flex items-center bg-[#2E2E2E] dark:bg-[#1a1b26] px-3 py-1.5 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-700 shadow-sm"
          onClick={handleClose} // Click to reopen the main content
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClose()}
          aria-label="Show content"
        >
          <WindowControls
            onClose={handleClose}       // These will affect the isVisible state of InstructionMacOSFrameTabs
            onMinimize={handleMinimize} // Minimize might not make sense here, but keep for consistency or future use
            onMaximize={handleMaximize} // Maximize might not make sense here
            isMaximized={isMaximized}   // Pass the state
            size="md"
          />
          <span className="ml-2 text-xs text-gray-300 dark:text-gray-400">
            Content hidden (click to show)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={windowRef}
      className={cn(
        isMaximized && "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8",
        className // Allow external classes to be merged
      )}
    >
      <InstructionMacOSFrameTabsContext.Provider
        value={{
          activeTab: activeTabLabel,
          setActiveTab: setActiveTabLabel,
          tabs: instructionTabs.map(t => ({label: t.label, id: t.id})),
          baseId
        }}
      >
        <MacOSWindow
          className={cn(
            "!my-0 !border-0 !shadow-none !rounded-none", // Added !rounded-none
            isMaximized && "w-full max-w-[95vw] sm:max-w-5xl max-h-[90vh] sm:max-h-[80vh] flex flex-col",
            !isMaximized && className // Apply user-passed className only if not maximized
          )}
          tabs={windowTabs}
          activeTabId={activeTabLabel}
          onTabClick={(tabId) => setActiveTabLabel(tabId)}
          contentClassName={cn(
            "bg-gray-100 dark:bg-gray-800",
            "p-2",
            isMaximized && "flex-1 overflow-auto",
            isMinimized && "hidden"
          )}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          isMaximized={isMaximized}
        >
          {!isMinimized && activeChildContentProcessed} {/* Render processed content only if not minimized */}
        </MacOSWindow>
      </InstructionMacOSFrameTabsContext.Provider>
    </div>
  );
}

// ShellTab and ShellParentTabs remain unchanged below if they are in the same file.
// Assuming they are, no changes needed for them. If they are separate, this change is self-contained to InstructionMacOSFrameTabs.