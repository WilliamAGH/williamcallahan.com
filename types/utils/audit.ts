/**
 * Types for S3 audit and analysis scripts
 */

export interface PathCheck {
  path: string;
  exists: boolean;
  error?: string;
  itemCount?: number;
}