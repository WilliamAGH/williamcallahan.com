/**
 * Personal Context Note Schemas
 * @module types/schemas/personal-context-note
 * @description
 * Zod v4 schemas for the TerminalContext component on detail pages.
 * Three-phase interaction: What → Why → Tell me more
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Core Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Page context type - determines content variation */
export const contextTypeSchema = z.enum(["bookmark", "book", "thought"]);

export type ContextType = z.infer<typeof contextTypeSchema>;

/** Props schema for TerminalContext component */
export const terminalContextPropsSchema = z.object({
  /** The type of page - affects the what/why/more content */
  type: contextTypeSchema,
  /** Optional className */
  className: z.string().optional(),
});

export type TerminalContextProps = z.infer<typeof terminalContextPropsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Content Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

/** Content for three-tier explanations per context type */
export const contextContentSchema = z.object({
  /** Quick inline answer */
  what: z.string(),
  /** Short explanation with formatting (array of lines) */
  why: z.array(z.string()),
  /** Full rich context (array of paragraphs) */
  more: z.array(z.string()),
});

export type ContextContent = z.infer<typeof contextContentSchema>;

/** Phase states for the three-phase interaction */
export const terminalContextPhaseSchema = z.enum(["idle", "what-typing", "what-done", "why-expanded", "more-expanded"]);

export type TerminalContextPhase = z.infer<typeof terminalContextPhaseSchema>;
