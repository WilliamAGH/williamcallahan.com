/**
 * Terminal Components Index
 * @module components/ui/terminal
 * @description Exports Terminal related components.
 */

export { Terminal } from './terminal'; // Export the main Terminal component
// Export the provider and the original hook name from terminalContext
export { TerminalProvider, useTerminalContext } from './terminalContext';
// Export relevant types from the correct path
export type { TerminalCommand, SelectionItem } from '@/types/terminal';
// Remove export of TerminalMode as it's no longer defined here
// If WindowState is needed externally, it should be imported from '@/lib/hooks/use-window-state'
