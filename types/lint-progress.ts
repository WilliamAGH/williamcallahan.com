/**
 * Type definitions for lint progress tracking
 */

export interface LintStats {
  timestamp: string;
  totalIssues: number;
  errors: number;
  warnings: number;
  byRule: Record<string, number>;
  byFile: Record<string, number>;
}
