/**
 * Terminal Components Index
 * @module components/ui/terminal
 * @description Exports Terminal related components properly separated into client/server/shared components.
 */

// Export the client terminal component
export { ClientTerminal as Terminal } from "./terminal.client";

// Export the provider and hook from client context
export { TerminalProvider, useTerminalContext } from "./terminal-context.client";

// Export shared components
export { TerminalHeader } from "./terminal-header";
export { History } from "./history";

// Export client-only components explicitly
export { CommandInput } from "./command-input.client";
export { SelectionView } from "./selection-view.client";

// Export relevant types
export type { TerminalCommand, SelectionItem } from "@/types/terminal";
// Remove export of TerminalMode as it's no longer defined here
// If WindowState is needed externally, it should be imported from '@/lib/hooks/use-window-state'

// Export the lazy-loaded terminal loader
export { TerminalLoader } from "./terminal-loader.client";
