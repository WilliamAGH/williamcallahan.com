/**
 * @fileoverview Type definitions for debugging and diagnostics.
 *
 * @description
 * This file contains TypeScript types used exclusively for the debug
 * and diagnostic endpoints, such as data validation and error reporting structures.
 */

export interface MDXPost {
  slug: string;
  // Add other fields as needed
}

export interface AuthorIssue {
  [filename: string]: string;
}

export interface FrontmatterIssue {
  [filename: string]: string[];
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  cause?: unknown;
}
