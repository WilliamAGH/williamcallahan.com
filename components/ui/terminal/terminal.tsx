/**
 * Terminal Component
 * 
 * A command-line interface component that provides interactive navigation
 * and search functionality. Fully responsive across all device sizes.
 */

"use client";

import { WindowControls } from '../navigation/window-controls';
import { History } from './history';
import { CommandInput } from './command-input';
import { SelectionView } from './selection-view';
import { useTerminal } from './use-terminal';

export function Terminal() {
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

  return (
    <div 
      className="bg-[#1a1b26] rounded-lg p-4 sm:p-6 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl cursor-text w-full max-w-[calc(100vw-2rem)] sm:max-w-5xl"
      onClick={focusInput}
    >
      <div className="mb-4">
        <WindowControls />
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