/**
 * Terminal Component
 *
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

"use client";

import React, { useEffect, useRef } from 'react'; // Assuming useCallback was here and removed
import { TerminalHeader } from './terminal-header';
import { History } from "./history";
import { CommandInput } from "./command-input.client";
import { SelectionView } from "./selection-view.client";
import { useTerminal } from "./use-terminal.client";
// Import the history context hook
import { useTerminalContext } from "./terminal-context.client";
// Import the new generalized context hook
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { TerminalSquare } from 'lucide-react'; // Import specific icon
import { cn } from "@/lib/utils";

// Define a unique ID for this instance of a window-like component
const TERMINAL_WINDOW_ID = 'main-terminal';
const isDevelopment = process.env.NODE_ENV === 'development';
const enableDebugLogs = isDevelopment && false; // Set to true only when debugging terminal

export function Terminal() {
  // Log component mount/unmount
  useEffect(() => {
    if (enableDebugLogs && process.env.NODE_ENV === 'development') {
      console.debug("--- Terminal Component Mounted ---");
    }
    return () => {
      if (enableDebugLogs && process.env.NODE_ENV === 'development') {
        console.debug("--- Terminal Component Unmounted ---");
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount/unmount

  // Ref for the scrollable content area
  const scrollContainerRef = useRef<HTMLDivElement>(null);

   // --- Get State from Hooks ---
   // History state from TerminalContext
   const { history: terminalHistory } = useTerminalContext();

  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,       // Rename actions for consistency if desired
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered           // Flag if the window is ready in the context
  } = useRegisteredWindowState(TERMINAL_WINDOW_ID, TerminalSquare, 'Restore Terminal', 'normal');

  // Local terminal interaction logic (input, selection, etc.)
  const {
    input,
    setInput,
    // history is now managed by useTerminalHistory, remove from here if useTerminal doesn't need it internally
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    inputRef,
    focusInput,
  } = useTerminal();

  // Effect to scroll to bottom when history changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: terminalHistory.length is a valid proxy for history changes
  useEffect(() => {
    // Scroll to bottom when terminalHistory.length changes, affecting scrollHeight
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [terminalHistory.length]); // Dependency on history from context

  // Determine maximized state - moved up before hooks that depend on it
  const isMaximized = windowState === 'maximized';

  // Add effect to scroll to the bottom when maximized
  useEffect(() => {
    // When terminal becomes maximized, scroll to bottom after a brief delay to ensure rendering is complete
    if (isMaximized && scrollContainerRef.current) {
      // Initial scroll attempt
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;

      // Focus the input immediately
      inputRef.current?.focus();

      // Use MutationObserver to detect when content changes and scroll again
      const observer = new MutationObserver(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });

      // Start observing the scroll container for DOM changes
      observer.observe(scrollContainerRef.current, {
        childList: true,
        subtree: true,
        characterData: true
      });

      // Also set a timeout as a fallback
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);

      return () => {
        observer.disconnect();
        clearTimeout(timer);
      };
    }
  }, [isMaximized, inputRef]);

  // Add effect to register/unregister click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMaximized && !scrollContainerRef.current?.contains(event.target as Node)) {
        maximizeWindow(); // Toggle back to normal state
      }
    };

    if (isMaximized) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMaximized, maximizeWindow]);

  // Effect for handling Escape key when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if maximized and the key is Escape
      if (isMaximized && event.key === 'Escape') {
        maximizeWindow(); // Toggle back to normal state
      }
    };

    if (isMaximized) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMaximized, maximizeWindow]); // Dependencies: run when isMaximized or maximizeWindow changes

   // --- Conditional Rendering ---
   
   // Add debug logging for terminal state
   if (enableDebugLogs && process.env.NODE_ENV === 'development') {
     console.debug("Terminal Component State Check:", {
       isRegistered,
       windowState,
       input,
       selection,
       historyLength: terminalHistory.length
     });
   }

   // If not yet ready (mounted and registered in context), render nothing.
  if (!isRegistered) {
    if (enableDebugLogs && process.env.NODE_ENV === 'development') {
      console.debug("Terminal Component: Not ready (pre-mount/hydration from context), rendering null.");
    }
    return null;
  }

  // Now that we are ready (mounted), render based on the current windowState
  // If closed or minimized, render null - the FloatingTerminalButton handles this
  if (windowState === "closed" || windowState === "minimized") {
    if (enableDebugLogs && process.env.NODE_ENV === 'development') {
      console.debug(`Terminal Component: Rendering null (windowState is ${windowState})`);
    }
    return null;
  }

  // Render normal or maximized view (implicit else, because we checked !isReady earlier)
  if (enableDebugLogs && process.env.NODE_ENV === 'development') {
    console.debug(`Terminal Component: Rendering ${windowState} view`);
  }

  // Define class sets for clarity
  const commonTerminalClasses = "bg-[#1a1b26] border border-gray-700 font-mono text-sm cursor-text overflow-hidden flex flex-col shadow-xl";
  // Margin handled with responsive utilities
  // Add z-10 to ensure it stays below the mobile menu dropdown
  const normalTerminalClasses = "relative z-10 mx-auto mt-4 mb-4 sm:mt-8 sm:mb-8 w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl p-4 sm:p-6 rounded-lg";
  const maximizedTerminalClasses = "fixed left-0 right-0 top-14 bottom-0 z-[60] w-full h-[calc(100vh-56px)] p-6 border-0 rounded-none"; // Full window below nav

  // Define classes for the inner scrollable area
  const commonScrollClasses = "text-gray-300 custom-scrollbar overflow-y-auto";
  const normalScrollClasses = "max-h-[300px] sm:max-h-[400px]";
  const maximizedScrollClasses = "flex-grow"; // No padding here, handled by outer div now

  return (
    <>
      {/* Backdrop for maximized state */}
      {isMaximized && (
        <div
          data-testid="terminal-backdrop"
          className="fixed left-0 right-0 top-14 bottom-0 z-[59] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            maximizeWindow();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              maximizeWindow();
            }
          }}
          tabIndex={0}
          role="button"
        />
      )}

      {/* Terminal Container - conditionally styled for maximized/normal state */}
      <div
        data-testid="terminal-container"
        className={cn(
          commonTerminalClasses,
          isMaximized ? maximizedTerminalClasses : normalTerminalClasses
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0">
          <TerminalHeader
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
            isMaximized={isMaximized}
          />
        </div>

        {/* Scrollable Content Area */}
        <section
          className={cn(commonScrollClasses, isMaximized ? maximizedScrollClasses : normalScrollClasses)}
          ref={scrollContainerRef}
          onClick={() => focusInput()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); // Prevent default space scroll
              focusInput();
            }
          }}
          aria-label="Terminal content area"
        >
          <div className="whitespace-pre-wrap break-words select-text">
            <History history={terminalHistory} />
            {selection ? (
              <SelectionView items={selection} onSelectAction={handleSelection} onExitAction={cancelSelection} />
            ) : (
              <CommandInput ref={inputRef} value={input} onChange={setInput} onSubmit={(e) => { void handleSubmit(e); }} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
