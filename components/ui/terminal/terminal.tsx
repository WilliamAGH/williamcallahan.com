/**
 * Terminal Component
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
      className="bg-[#1a1b26] rounded-lg p-6 font-mono text-sm max-w-5xl mx-auto mt-8 border border-gray-700 shadow-xl cursor-text"
      onClick={focusInput}
    >
      <div className="mb-4">
        <WindowControls />
      </div>
      <div className="text-gray-300 max-h-[400px] overflow-y-auto custom-scrollbar">
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
  );
}