/**
 * Terminal Component
 *
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

 "use client";

 import { useEffect, useRef, useCallback } from 'react'; // Import useEffect, useRef, and useCallback
 import { TerminalHeader } from './terminal-header';
 import { History } from "./history";
import { CommandInput } from "./command-input";
import { SelectionView } from "./selection-view";
import { useTerminal } from "./use-terminal";
// Import the history context hook
import { useTerminalContext } from "./terminalContext";
// Import the new generalized context hook
import { useRegisteredWindowState } from "@/lib/context/GlobalWindowRegistryContext";
import { TerminalSquare } from 'lucide-react'; // Import specific icon
import { cn } from "@/lib/utils";

// Define a unique ID for this instance of a window-like component
const TERMINAL_WINDOW_ID = 'main-terminal';

export function Terminal() {
  // Log component mount/unmount
  useEffect(() => {
    console.log("--- Terminal Component Mounted ---");
    return () => {
      console.log("--- Terminal Component Unmounted ---");
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
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [terminalHistory]); // Dependency on history from context

  // Determine maximized state - moved up before hooks that depend on it
  const isMaximized = windowState === 'maximized';

  // Function to handle clicks outside the terminal when maximized
  const handleBackdropClick = () => {
    if (isMaximized) {
      maximizeWindow(); // Toggle back to normal state
    }
  };

  // Add keydown handler for ESC key when maximized - MOVED BEFORE CONDITIONAL RETURNS
  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isMaximized) {
      maximizeWindow(); // Toggle back to normal state
    }
  }, [isMaximized, maximizeWindow]);

  // Add effect to register/unregister ESC key handler - MOVED BEFORE CONDITIONAL RETURNS
  useEffect(() => {
    if (isMaximized) {
      // Only add the event listener when maximized
      document.addEventListener('keydown', handleEscapeKey);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMaximized, handleEscapeKey]);

   // --- Conditional Rendering ---

   // If not yet ready (mounted and registered in context), render nothing.
  if (!isRegistered) {
    console.log(`Terminal Component: Not ready (pre-mount/hydration from context), rendering null.`);
    return null;
  }

  // Now that we are ready (mounted), render based on the current windowState
  // If closed or minimized, render null - the FloatingTerminalButton handles this
  if (windowState === "closed" || windowState === "minimized") {
    console.log(`Terminal Component: Rendering null (windowState is ${windowState})`);
    return null;
  }

  // Render normal or maximized view (implicit else, because we checked !isReady earlier)
  console.log(`Terminal Component: Rendering ${windowState} view`);

  // Define class sets for clarity
  const commonTerminalClasses = "bg-[#1a1b26] border border-gray-700 font-mono text-sm cursor-text overflow-hidden flex flex-col rounded-lg shadow-xl";
  const normalTerminalClasses = "relative mx-auto mt-8 w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl p-4 sm:p-6";
  const maximizedTerminalClasses = "w-full max-w-6xl h-full !max-h-none p-6"; // No positioning here!

  // Define classes for the inner scrollable area
  const commonScrollClasses = "text-gray-300 custom-scrollbar overflow-y-auto";
  const normalScrollClasses = "max-h-[300px] sm:max-h-[400px]";
  const maximizedScrollClasses = "flex-grow"; // No padding here, handled by outer div now

  return (
    <>
      {/* Backdrop: Rendered only when maximized, handles click outside */}
      {isMaximized && (
        <div
          data-testid="terminal-backdrop"
          className="fixed inset-0 z-[59] bg-black/50 backdrop-blur-sm"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Conditional Centering Wrapper for Maximized State */}
      {isMaximized ? (
        <div
          data-testid="maximized-wrapper"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:py-16 md:px-8" // Flexbox centering, covers viewport, correct z-index, padding
        >
          {/* Terminal Div (Maximized State) - Uses appearance/dimension classes ONLY */}
          <div
            data-testid="terminal-container" // Added test ID
            className={cn(commonTerminalClasses, maximizedTerminalClasses)}
          >
            {/* Header */}
            <div className="flex-shrink-0">
              <TerminalHeader
                 onClose={closeWindow}
                 onMinimize={minimizeWindow}
                 onMaximize={maximizeWindow}
               />
            </div>
            {/* Scrollable Content Area (Maximized) */}
            <div
              className={cn(commonScrollClasses, maximizedScrollClasses)}
              ref={scrollContainerRef}
              onClick={focusInput}
            >
              <div className="whitespace-pre-wrap break-words select-text">
                <History history={terminalHistory} />
                {selection ? (
                  <SelectionView items={selection} onSelect={handleSelection} onExit={cancelSelection} />
                ) : (
                  <CommandInput ref={inputRef} value={input} onChange={setInput} onSubmit={handleSubmit} />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Terminal Div (Normal State) - Uses relative positioning classes */
        <div
          data-testid="terminal-container" // Added test ID
          className={cn(commonTerminalClasses, normalTerminalClasses)}
        >
          {/* Header */}
          <div className="flex-shrink-0">
            <TerminalHeader
               onClose={closeWindow}
               onMinimize={minimizeWindow}
               onMaximize={maximizeWindow}
             />
          </div>
          {/* Scrollable Content Area (Normal) */}
          <div
            className={cn(commonScrollClasses, normalScrollClasses)}
            ref={scrollContainerRef}
            onClick={focusInput}
          >
            <div className="whitespace-pre-wrap break-words select-text">
              <History history={terminalHistory} />
              {selection ? (
                <SelectionView items={selection} onSelect={handleSelection} onExit={cancelSelection} />
              ) : (
                <CommandInput ref={inputRef} value={input} onChange={setInput} onSubmit={handleSubmit} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
