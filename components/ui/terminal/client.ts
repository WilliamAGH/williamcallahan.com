/**
 * Terminal Client-Side Exports
 *
 * IMPORTANT: This file exports client components and hooks only.
 * All exports must be marked with 'use client' directive.
 * These components cannot be imported by server components.
 *
 * @module components/ui/terminal/client
 * @see {@link "docs/architecture/terminalGUI.md"} - Terminal architecture documentation
 */

'use client';

export { TerminalClient } from './terminal.client';
export { CommandInput } from './commandInput.client';
export { History } from './history';
export { SelectionView } from './selectionView';
export { useTerminal } from './useTerminal';
export { useTerminalContext, TerminalProvider } from './terminalContext';
