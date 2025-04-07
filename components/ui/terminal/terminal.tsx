/**
 * Terminal Component
 *
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

"use client";

import { useEffect } from 'react'; // Import useEffect
import { TerminalHeader } from './terminal-header';
import { History } from './history';
import { CommandInput } from './command-input';
import { SelectionView } from './selection-view';
import { useTerminal } from './use-terminal';
import { useTerminalContext } from './terminalContext';
import { cn } from '@/lib/utils';

export function Terminal() {
  // Log component mount/unmount
  useEffect(() => {
    console.log("--- Terminal Component Mounted ---");
    return () => {
      console.log("--- Terminal Component Unmounted ---");
    };
  }, []); // Empty dependency array ensures this runs only on mount/unmount

  const {
    input,
    setInput,
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    inputRef,
    focusInput
  } = useTerminal();
  const { terminalMode, setTerminalMode } = useTerminalContext(); // Get mode state

  // Log current mode whenever it changes
  useEffect(() => {
    console.log("Terminal Component Render - Mode:", terminalMode);
  }, [terminalMode]);

  // Handle closed state
  if (terminalMode === 'closed') {
    console.log("Terminal Component: Rendering null (closed)");
    return null;
  }

  // Handle minimized state
  if (terminalMode === 'minimized') {
    console.log("Terminal Component: Rendering minimized view");
    return (
      <div className="bg-[#1a1b26] rounded-lg p-2 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl w-fit">
        <div className="flex items-center gap-2">
          <TerminalHeader />
          <button
            aria-label="Restore terminal"
            className="text-xs text-gray-400 hover:text-gray-200"
            onClick={() => {
              console.log("Restore button clicked");
              setTerminalMode('normal');
            }}
          >
            Restore
          </button>
        </div>
      </div>
    );
  }

  // Handle normal and maximized states
  console.log(`Terminal Component: Rendering ${terminalMode} view`);
  return (
    <div
      className={cn(
        "bg-[#1a1b26] rounded-lg p-4 sm:p-6 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl cursor-text w-full max-w-[calc(100vw-2rem)]",
        terminalMode === 'maximized' ? 'sm:max-w-full' : 'sm:max-w-5xl' // Adjust max-width for maximized state
      )}
      onClick={(e) => focusInput(e)} // Pass event to focusInput
    >
      <div className="mb-4">
        <TerminalHeader /> {/* Use correct header component */}
      </div>
      <div className="text-gray-300 max-h-[300px] sm:max-h-[400px] overflow-y-auto custom-scrollbar">
        <div className="whitespace-pre-wrap break-words select-text">
          <History history={history} />
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
