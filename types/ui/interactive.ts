/**
 * Interactive Component Types
 *
 * SCOPE: Types for interactive UI components like dropdowns and focus traps.
 */
import type { ReactNode } from "react";

export interface CollapseDropdownProps {
  /** Dropdown trigger content */
  trigger: ReactNode;
  /** Dropdown content */
  children: ReactNode;
  /** Whether dropdown is initially open */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Custom CSS classes */
  className?: string;
  /** Dropdown direction */
  direction?: "down" | "up" | "left" | "right";
}

export interface CollapseDropdownExtendedProps extends Omit<CollapseDropdownProps, "trigger"> {
  summary: ReactNode;
  summaryClassName?: string;
  contentClassName?: string;
  id?: string;
  /** Allow nested flag to adjust styling specifically for nested dropdowns */
  isNested?: boolean;
}

export interface FocusTrapProps {
  /** Whether the focus trap is active */
  active: boolean;
  /** Child components to wrap */
  children: ReactNode;
  /** Optional callback when focus trap is activated */
  onActivate?: () => void;
  /** Optional callback when focus trap is deactivated */
  onDeactivate?: () => void;
}

export interface FocusTrapExtendedProps extends FocusTrapProps {
  initialFocus?: boolean;
  onEscape?: () => void;
}

/**
 * Generic share button props
 * @usage - General sharing functionality for any URL
 */
export interface ShareButtonProps {
  url: string;
  title?: string;
  description?: string;
  className?: string;
}

export interface DropdownRegistryEntry {
  ref: React.RefObject<HTMLDetailsElement>;
  isOpen: boolean;
}

export interface CollapseDropdownContextType {
  registerDropdown: (id: string, ref: React.RefObject<HTMLDetailsElement>) => void;
  unregisterDropdown: (id: string) => void;
  findDropdownForHash: (hash: string) => HTMLDetailsElement | null;
  openAndScrollToDropdownAnchor: (dropdownElement: HTMLDetailsElement, hash: string) => void;
}
