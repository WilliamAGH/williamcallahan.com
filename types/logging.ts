/**
 * Logging types for environment-aware logging system
 */

export interface LogOptions {
  /** Force verbose output regardless of environment */
  forceVerbose?: boolean;
  /** Additional context data to include in production logs */
  context?: Record<string, unknown>;
  /** Category/prefix for the log message */
  category?: string;
}