/**
 * Thoughts Feature Component Props
 * @module types/features/thoughts
 * @description
 * Component props for the Thoughts (TIL-style short-form content) feature.
 * Business logic types are in types/schemas/thought.ts
 */

import type { ThoughtListItem, Thought } from "@/types/schemas/thought";

// ─────────────────────────────────────────────────────────────────────────────
// Window Component Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for ThoughtsWindow wrapper component
 */
export interface ThoughtsWindowProps {
  children: React.ReactNode;
  windowTitle?: string;
  windowId?: string;
}

/**
 * Props for inner window content (used by dynamic import)
 */
export interface ThoughtsWindowContentProps {
  children: React.ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  windowTitle?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// List Component Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for ThoughtCard (individual thought preview in list)
 */
export interface ThoughtCardProps {
  thought: ThoughtListItem;
  /** Enable preload hints for images/links */
  preload?: boolean;
}

/**
 * Props for ThoughtsList (grid/list of thought cards)
 */
export interface ThoughtsListProps {
  thoughts: ThoughtListItem[];
  /** Title displayed above the list */
  title?: string;
  /** Description/subtitle */
  description?: string;
}

/**
 * Props for ThoughtsServer (server component wrapper)
 */
export interface ThoughtsServerProps {
  thoughts: ThoughtListItem[];
  title?: string;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Component Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for ThoughtDetail (individual thought page)
 */
export interface ThoughtDetailProps {
  thought: Thought;
}

/**
 * Props for ThoughtContent (markdown content renderer)
 */
export interface ThoughtContentProps {
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Context Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Next.js page params for /thoughts/[slug]
 */
export interface ThoughtPageParams {
  slug: string;
}

/**
 * Next.js page context for thought detail page
 */
export interface ThoughtPageContext {
  params: Promise<ThoughtPageParams>;
}

/**
 * Next.js page params for /thoughts/[category]/[slug]
 */
export interface ThoughtCategoryPageParams {
  category: string;
  slug: string;
}

/**
 * Next.js page context for categorized thought page
 */
export interface ThoughtCategoryPageContext {
  params: Promise<ThoughtCategoryPageParams>;
}
