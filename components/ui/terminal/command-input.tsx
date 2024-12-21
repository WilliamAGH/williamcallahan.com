/**
 * Command Input Component
 */

import { forwardRef } from 'react';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(
  function CommandInput({ value, onChange, onSubmit }, ref) {
    return (
      <form onSubmit={onSubmit} className="w-full table">
        <div className="flex items-center w-full">
          <span className="text-[#7aa2f7] select-none mr-2">$</span>
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-transparent w-full focus:outline-none text-gray-300 caret-gray-300"
            autoFocus
          />
        </div>
      </form>
    );
  }
);