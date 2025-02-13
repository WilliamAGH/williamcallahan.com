/**
 * Terminal Component
 */

"use client";

import React from 'react';

import { WindowControls } from '../navigation/windowControls';
import { History } from './history';
import { CommandInput } from './commandInput';
import { SelectionView } from './selectionView';
import { useTerminal } from './useTerminal';

export function Terminal() {
  const {
    input,
    setInput,
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection
  } = useTerminal();

  return (
    <div className="bg-[#1a1b26] rounded-lg p-6 font-mono text-sm max-w-2xl mx-auto mt-8 border border-gray-700 shadow-xl">
      <div className="mb-4">
        <WindowControls />
      </div>
      <div className="text-gray-300 select-text">
        <History history={history} />
        {selection ? (
          <SelectionView
            items={selection}
            onSelect={handleSelection}
            onExit={cancelSelection}
          />
        ) : (
          <CommandInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
