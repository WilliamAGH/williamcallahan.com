/**
 * Command Input Component
 *
 * Terminal input field that prevents iOS Safari zoom while maintaining visual consistency.
 * Uses CSS transform to scale down the visually larger font size.
 */

"use client";

import { forwardRef } from 'react';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(
  function CommandInput({ value, onChange, onSubmit }, ref) {
    
    return (
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="w-full table">
        <div className="flex items-center w-full">
          <span className="text-[#7aa2f7] select-none mr-2">$</span>
          <div className="relative flex-1 transform-gpu">
            <label htmlFor="terminal-command" className="sr-only">Terminal command</label>
            <input
              id="terminal-command"
              ref={ref}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="bg-transparent w-full focus:outline-none text-gray-300 caret-gray-300
                text-[16px] transform-gpu scale-[0.875] origin-left"
              style={{
                /* Offset the larger font size to maintain layout */
                margin: '-0.125rem 0',
              }}
              aria-label="Terminal command input"
              placeholder="Enter a command"
              title="Terminal command input"
            />
          </div>
        </div>
      </form>
    );
  }
);