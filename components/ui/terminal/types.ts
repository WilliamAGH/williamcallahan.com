/**
 * Terminal Types
 * 
 * Type definitions for the terminal component.
 */

export interface TerminalProps {
  /** Optional callback when navigation occurs */
  onNavigate?: (path: string) => void;
}

export interface TerminalCommand {
  /** Command input by the user */
  input: string;
  /** Output displayed in response */
  output: string;
}