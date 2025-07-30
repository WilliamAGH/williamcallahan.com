/**
 * Terminal Component
 *
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

"use client";

// Import the new generalized context hook
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import { TerminalSquare } from "lucide-react"; // Import specific icon
import { useEffect, useRef, useState } from "react";
import { CommandInput } from "./command-input.client";
import { History } from "./history";
import { SelectionView } from "./selection-view.client";
// Import the history context hook
import { useTerminalContext } from "./terminal-context.client";
import { TerminalHeader } from "./terminal-header";
import { useTerminal } from "./use-terminal.client";

// Define a unique ID for this instance of a window-like component
const TERMINAL_WINDOW_ID = "main-terminal";

export function Terminal() {
  // Ref for the scrollable content area
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track if terminal is focused
  const [isTerminalFocused, setIsTerminalFocused] = useState(false);

  // --- Get State from Hooks ---
  // History state from TerminalContext
  const { history: terminalHistory } = useTerminalContext();

  // Register this window instance and get its state/actions
  /**
   * IMPORTANT: The terminal should always register in the `normal` state.
   * Do NOT change the `initialState` argument to "closed" or "minimized" —
   * doing so hides the terminal on initial render and breaks expected UX.
   */
  const {
    windowState,
    close: closeWindow, // Rename actions for consistency if desired
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered, // Flag if the window is ready in the context
  } = useRegisteredWindowState(TERMINAL_WINDOW_ID, TerminalSquare, "Restore Terminal", "normal");

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
    isSubmitting,
  } = useTerminal();

  // Effect to scroll to bottom when history changes
  useEffect(() => {
    // Scroll to bottom when terminalHistory.length changes, affecting scrollHeight
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []); // Dependency on history from context

  // Determine maximized state - moved up before hooks that depend on it
  const isMaximized = windowState === "maximized";

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
        // Don't auto-scroll to bottom if SelectionView is active - let it handle its own navigation
        // Check if SelectionView is actually rendered in the DOM (more reliable than closure state)
        if (scrollContainerRef.current?.querySelector('[data-testid="selection-view"]')) {
          return; // Let SelectionView control scrolling during navigation
        }

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });

      // Start observing the scroll container for DOM changes
      observer.observe(scrollContainerRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
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
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMaximized, maximizeWindow]);

  // Effect for handling Escape key when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if maximized and the key is Escape
      if (isMaximized && event.key === "Escape") {
        maximizeWindow(); // Toggle back to normal state
      }
    };

    if (isMaximized) {
      document.addEventListener("keydown", handleKeyDown);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMaximized, maximizeWindow]); // Dependencies: run when isMaximized or maximizeWindow changes

  // Effect to prevent page scrolling when terminal has focus or is being interacted with
  useEffect(() => {
    let terminalContainer: Element | null = null;

    // We need to wait for the ref to be available
    const checkAndSetup = () => {
      terminalContainer = scrollContainerRef.current?.closest('[data-testid="terminal-container"]') || null;
    };

    // Check immediately and after a short delay
    checkAndSetup();
    const setupTimer = setTimeout(checkAndSetup, 100);

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Re-check in case the ref wasn't available initially
      if (!terminalContainer) {
        checkAndSetup();
      }

      // If the terminal is focused or contains the active element, prevent arrow key scrolling
      const isTerminalActive =
        terminalContainer &&
        (terminalContainer.contains(document.activeElement) ||
          document.activeElement === terminalContainer ||
          isTerminalFocused);

      if (isTerminalActive) {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)
        ) {
          // Only prevent default to stop page scrolling, but let the event propagate
          e.preventDefault();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Prevent page scrolling when mouse is over terminal
      if (!terminalContainer) {
        checkAndSetup();
      }

      if (terminalContainer && e.target instanceof Node && terminalContainer.contains(e.target)) {
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
          const canScrollUp = scrollContainer.scrollTop > 0;
          const canScrollDown = scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight;

          // Only prevent page scrolling if terminal can't scroll in that direction
          if ((e.deltaY < 0 && !canScrollUp) || (e.deltaY > 0 && !canScrollDown)) {
            e.preventDefault();
          }
        }
      }
    };

    // Add listeners in capture phase with highest priority
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true, passive: false });
    document.addEventListener("keydown", handleWindowKeyDown, { capture: true, passive: false });
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });

    return () => {
      clearTimeout(setupTimer);
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
      document.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
      window.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [isTerminalFocused]);

  // Effect for forwarding keyboard events to SelectionView when it's active
  useEffect(() => {
    if (selection && scrollContainerRef.current) {
      const handleContainerKeyDown = (e: KeyboardEvent) => {
        // Forward navigation keys to SelectionView when it's active
        if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
          const selectionView = scrollContainerRef.current?.querySelector('[data-testid="selection-view"]');
          if (selectionView && document.activeElement !== selectionView) {
            // Create and dispatch a synthetic keyboard event to the SelectionView
            const syntheticEvent = new KeyboardEvent("keydown", {
              key: e.key,
              code: e.code,
              keyCode: e.keyCode,
              which: e.which,
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey,
              metaKey: e.metaKey,
              bubbles: true,
              cancelable: true,
            });
            selectionView.dispatchEvent(syntheticEvent);
          }
        }
      };

      // Use capture phase to intercept events before they reach other elements
      const container = scrollContainerRef.current;
      container.addEventListener("keydown", handleContainerKeyDown, { capture: true });

      return () => {
        container.removeEventListener("keydown", handleContainerKeyDown, { capture: true });
      };
    }
  }, [selection]);

  // --- Conditional Rendering ---

  // If not yet ready (mounted and registered in context), render nothing.
  if (!isRegistered) {
    return null;
  }

  // Now that we are ready (mounted), render based on the current windowState
  // If closed or minimized, render null - the FloatingTerminalButton handles this
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  // Render normal or maximized view (implicit else, because we checked !isReady earlier)
  // Define class sets for clarity
  const commonTerminalClasses =
    "bg-[#1a1b26] border border-gray-700 font-mono text-sm cursor-text overflow-hidden flex flex-col shadow-xl";
  // Margin handled with responsive utilities
  // Add z-10 to ensure it stays below the mobile menu dropdown
  const normalTerminalClasses =
    "relative z-10 mx-auto mt-4 mb-4 sm:mt-8 sm:mb-8 w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl p-4 sm:p-6 rounded-lg";
  const maximizedTerminalClasses =
    "fixed left-0 right-0 top-14 bottom-0 z-[60] w-full h-[calc(100vh-56px)] p-6 border-0 rounded-none"; // Full window below nav

  // Define classes for the inner scrollable area
  const commonScrollClasses = "text-gray-300 custom-scrollbar overflow-y-auto";
  const normalScrollClasses = "max-h-[300px] sm:max-h-[400px]";
  const maximizedScrollClasses = "flex-grow"; // No padding here, handled by outer div now

  return (
    <>
      {/* Backdrop for maximized state */}
      {isMaximized && (
        <button
          type="button"
          data-testid="terminal-backdrop"
          className="fixed left-0 right-0 top-14 bottom-0 z-[59] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            maximizeWindow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              maximizeWindow();
            }
          }}
          aria-label="Close terminal"
        />
      )}

      {/* Terminal Container - conditionally styled for maximized/normal state */}
      <section
        data-testid="terminal-container"
        className={cn(commonTerminalClasses, isMaximized ? maximizedTerminalClasses : normalTerminalClasses)}
        aria-label="Terminal"
        onFocus={() => setIsTerminalFocused(true)}
        onBlur={(e) => {
          // Only blur if focus is leaving the terminal entirely
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsTerminalFocused(false);
          }
        }}
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
          onClick={() => {
            // Only focus input if SelectionView is not active
            if (!selection) {
              focusInput();
            }
          }}
          onKeyDown={(e) => {
            // Only prevent space key default behavior if the input is not focused
            // This allows typing spaces in the input while preventing scroll when clicking elsewhere
            if (e.key === " " && document.activeElement !== inputRef.current) {
              e.preventDefault(); // Prevent default space scroll
              focusInput();
            }
            // Don't handle Enter key here - let it propagate to the form
          }}
          aria-label="Terminal content area"
        >
          <div className="whitespace-pre-wrap break-words select-text">
            <History history={terminalHistory} />
            {selection ? (
              <SelectionView
                items={selection}
                onSelectAction={handleSelection}
                onExitAction={cancelSelection}
                scrollContainerRef={scrollContainerRef}
              />
            ) : (
              <CommandInput
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                disabled={isSubmitting}
              />
            )}
          </div>
        </section>
      </section>
    </>
  );
}
