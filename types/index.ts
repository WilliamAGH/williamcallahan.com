/**
 * Type Definitions Index
 *
 * Central export point for all type definitions used across the application.
 * Organizes types by domain/feature area.
 */

export * from './experience';
export * from './navigation';
export * from './social';
export * from './terminal';
export * from './bookmark';
export * from './github';
export * from './logo';
export * from './error';

// Add new interface for client error payloads
export interface ClientErrorPayload {
  message?: string;
  resource?: string; // e.g., script URL if it's a script error
  type?: string;     // e.g., 'ChunkLoadError', 'TypeError'
  url?: string;      // The URL where the error occurred
  stack?: string;
  buildId?: string;  // Next.js build ID
  // Allow other properties that might be sent from various client-side error sources
  [key: string]: unknown; // Use unknown instead of any for better type safety
}

// For OG Image API results
export interface OgFetchResult {
  imageUrl: string | null; // Can be null if no image found
  bannerImageUrl?: string | null;
  ogMetadata?: Record<string, string | undefined | null>; // OG tags can have various string values or be absent
  error?: string;
}
