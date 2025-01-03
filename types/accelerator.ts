/**
 * Accelerator Types
 */

export interface Accelerator {
  program: 'techstars' | 'ycombinator';
  batch: string;
  location: string;
  /** Optional logo URL or file path */
  logo?: string;
}
