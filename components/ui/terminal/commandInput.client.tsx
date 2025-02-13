/**
 * Command Input Component
 *
 * Handles terminal command input with proper state management and cleanup.
 * Provides auto-suggestions and input validation.
 *
 * @module components/ui/terminal/commandInput
 * @see {@link Terminal} - Parent terminal component
 * @see {@link navigationCommands} - Command processing
 */

import { forwardRef } from "react";

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  disabled?: boolean;
  placeholder?: string;
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  inputRef,
  disabled,
  placeholder = "Type a command or 'help' for available commands"
}: CommandInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.value);
    }
  };

  return (
    <form
      className="flex items-center"
      onSubmit={handleSubmit}
      role="search"
      aria-label="Terminal command input"
    >
      <span
        className="text-green-500 mr-2 select-none"
        aria-hidden="true"
      >
        $
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-gray-300 disabled:opacity-50 placeholder-gray-600"
        aria-label="Enter command"
        role="searchbox"
        autoComplete="off"
        spellCheck="false"
        data-autocapitalize="none"
      />
    </form>
  );
}

CommandInput.displayName = "CommandInput";
