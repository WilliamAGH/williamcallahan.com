/**
 * Project AI Analysis Types
 * @module types/project-ai-analysis
 * @description
 * Non-schema types for the project AI analysis feature.
 */

import type { ProjectAiAnalysisResponse } from "./schemas/project-ai-analysis";
import type { CachedAnalysis } from "./ai-analysis";
import type { Project } from "./project";

// ─────────────────────────────────────────────────────────────────────────────
// Context Extraction Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracted context from a project for LLM prompt construction.
 * Contains the pertinent fields needed to generate an analysis.
 */
export interface ProjectAnalysisContext {
  /** Project name */
  name: string;
  /** Short summary */
  shortSummary: string;
  /** Full description */
  description: string;
  /** Project URL */
  url: string;
  /** GitHub repository URL if available */
  githubUrl: string | null;
  /** Technology stack */
  techStack: string[];
  /** Tags/categories */
  tags: string[];
  /** Additional note/disclaimer */
  note: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component State Types
// ─────────────────────────────────────────────────────────────────────────────

/** Possible states for the AI analysis component */
export type ProjectAnalysisStatus = "idle" | "loading" | "success" | "error";

/** State object for the AI analysis component */
export interface ProjectAnalysisState {
  status: ProjectAnalysisStatus;
  analysis: ProjectAiAnalysisResponse | null;
  error: string | null;
}

/** Initial state for the AI analysis component */
export const INITIAL_PROJECT_ANALYSIS_STATE: ProjectAnalysisState = {
  status: "idle",
  analysis: null,
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component Props Types
// ─────────────────────────────────────────────────────────────────────────────

/** Props for the ProjectAiAnalysis component */
export interface ProjectAiAnalysisProps {
  project: Project;
  className?: string;
  /** Auto-trigger analysis on mount (default: true) */
  autoTrigger?: boolean;
  /** Pre-cached analysis from S3 (if available) */
  initialAnalysis?: CachedAnalysis<ProjectAiAnalysisResponse> | null;
  /** Start with analysis content collapsed (default: false) */
  defaultCollapsed?: boolean;
}
