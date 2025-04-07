/**
 * Terminal Component
 *
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

 "use client";

 import { useEffect, useRef } from 'react'; // Import useEffect and useRef
 import { TerminalHeader } from './terminal-header';
 import { History } from "./history";
import { CommandInput } from "./command-input";
import { SelectionView } from "./selection-view";
import { useTerminal } from "./use-terminal";
// Import the history context hook
import { useTerminalContext } from "./terminalContext";
// Import the new window state hook
import { useWindowState, WindowState } from "@/lib/hooks/use-window-state";
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
  // Window state managed by the useWindowState hook for this specific terminal instance
  const {
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady // Use readiness from the window state hook
  } = useWindowState(TERMINAL_WINDOW_ID, 'normal'); // Provide ID and initial state

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

  // Log current window state whenever it changes
  useEffect(() => {
    // Only log if client is ready (from useWindowState)
    if (isReady) {
      console.log(`Terminal Component Render (${TERMINAL_WINDOW_ID}) - Window State:`, windowState);
     }
   }, [windowState, isReady]);

  // Effect to scroll to bottom when history changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [terminalHistory]); // Dependency on history from context

   // --- Conditional Rendering ---

   // If not yet ready (mounted and potentially hydrated from storage), render nothing.
  if (!isReady) {
    console.log(`Terminal Component (${TERMINAL_WINDOW_ID}): Not ready (pre-mount/hydration), rendering null.`);
    return null;
  }

  // Now that we are ready (mounted), render based on the current windowState
  if (windowState === "closed") {
    console.log(`Terminal Component (${TERMINAL_WINDOW_ID}): Rendering null (windowState is closed)`);
    return null;
  }

  if (windowState === "minimized") {
    console.log(`Terminal Component (${TERMINAL_WINDOW_ID}): Rendering minimized view (windowState is minimized)`);
    // Render minimized view
    return (
      <div className="bg-[#1a1b26] rounded-lg p-2 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl w-fit">
        <div className="flex items-center gap-2">
          <TerminalHeader
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
          />
        </div>
      </div>
    );
  }

  // Render normal or maximized view (implicit else, because we checked !isReady earlier)
  console.log(`Terminal Component (${TERMINAL_WINDOW_ID}): Rendering ${windowState} view`);
  return (
    <div
      // Apply width conditionally based on windowState
      className={cn(
        "bg-[#1a1b26] rounded-lg p-4 sm:p-6 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl cursor-text w-full max-w-[calc(100vw-2rem)] transition-all duration-300 ease-in-out", // Base styles + transition
        // Apply correct classes: 'sm:max-w-full' for maximized, 'sm:max-w-3xl' for normal
        windowState === 'maximized' ? 'sm:max-w-full' : 'sm:max-w-3xl'
      )}
      onClick={(e) => focusInput(e)} // Pass event to focusInput
    >
      <div className="mb-4">
         {/* Pass the correct handlers from useWindowState down */}
         <TerminalHeader
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
          />
      </div>
      {/* Inner container for scrollable content - height changes based on windowState */}
      <div className={cn(
          "text-gray-300 overflow-y-auto custom-scrollbar max-h-[300px]", // Base height for mobile
          // Use windowState for height
           windowState === "maximized" ? "sm:max-h-[600px]" : "sm:max-h-[400px]" // Conditional height for sm+ screens
       )}
       ref={scrollContainerRef} // Attach the ref here
       >
         <div className="whitespace-pre-wrap break-words select-text">
           {/* Use history from TerminalContext */}
           <History history={terminalHistory} />
          {selection ? (
            <SelectionView
              items={selection}
              onSelect={handleSelection}
              onExit={cancelSelection}
            />
          ) : (
            <CommandInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
