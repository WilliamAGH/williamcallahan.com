/**
 * Types for S3 reset and regeneration script
 */

export interface DeletionStats {
  totalFiles: number;
  deletedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
}

export interface RegenerationStats {
  bookmarks: { success: boolean; count: number; error?: string };
  slugMappings: { success: boolean; count: number; error?: string };
  github: { success: boolean; count: number; error?: string };
  search: { success: boolean; count: number; error?: string };
  contentGraph: { success: boolean; count: number; error?: string };
  logos: { success: boolean; count: number; error?: string };
}

export interface AuditLog {
  timestamp: string;
  environment: string;
  envSuffix: string;
  isDryRun: boolean;
  deletionStats: DeletionStats;
  regenerationStats: RegenerationStats;
  duration: number;
  success: boolean;
}

export type CategoryKey =
  | "bookmarks"
  | "github"
  | "search"
  | "content"
  | "images"
  | "opengraph"
  | "ratelimit"
  | "locks"
  | "logos";

export type CategoryName =
  | "Bookmarks"
  | "GitHub Activity"
  | "Search Indexes"
  | "Content Graph"
  | "Image Manifests"
  | "OpenGraph"
  | "Rate Limiting"
  | "Locks"
  | "Other";
