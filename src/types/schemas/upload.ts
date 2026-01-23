/**
 * Upload Feature Zod Schemas
 * @module types/schemas/upload
 * @description
 * Zod schemas for validating file upload requests and responses.
 * Used at API boundaries to ensure type safety.
 */

import { z } from "zod/v4";

// =============================================================================
// FILE TYPE SCHEMAS
// =============================================================================

/**
 * Valid file type identifiers
 */
export const UploadFileTypeSchema = z.enum(["book-pdf", "book-epub"]);
export type UploadFileType = z.infer<typeof UploadFileTypeSchema>;

/**
 * File type configuration with validation rules
 */
export const FileTypeConfigSchema = z.object({
  value: UploadFileTypeSchema,
  label: z.string(),
  mimeTypes: z.array(z.string()),
  extensions: z.array(z.string()),
  maxSizeBytes: z.number().positive(),
});
export type FileTypeConfig = z.infer<typeof FileTypeConfigSchema>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Upload initiation request
 */
export const UploadRequestSchema = z.object({
  fileType: UploadFileTypeSchema,
  fileName: z.string().min(1).max(255),
  fileSize: z
    .number()
    .positive()
    .max(100 * 1024 * 1024), // Max 100MB
  contentType: z.string().min(1),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

/**
 * Upload initiation response
 */
export const UploadResponseSchema = z.object({
  success: z.boolean(),
  uploadUrl: z.string().url().optional(),
  s3Key: z.string().optional(),
  error: z.string().optional(),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/**
 * Upload completion request (after file is uploaded to S3)
 */
export const UploadCompleteRequestSchema = z.object({
  s3Key: z.string().min(1),
  fileType: UploadFileTypeSchema,
  fileName: z.string().min(1),
});
export type UploadCompleteRequest = z.infer<typeof UploadCompleteRequestSchema>;

/**
 * Upload completion response
 */
export const UploadCompleteResponseSchema = z.object({
  success: z.boolean(),
  chromaCollectionId: z.string().optional(),
  documentsIndexed: z.number().optional(),
  processingTimeMs: z.number().optional(),
  error: z.string().optional(),
});
export type UploadCompleteResponse = z.infer<typeof UploadCompleteResponseSchema>;

// =============================================================================
// FILE TYPE CONFIGURATIONS
// =============================================================================

/**
 * Supported file type configurations
 * These define the validation rules for each file type
 */
export const FILE_TYPE_CONFIGS: Record<UploadFileType, FileTypeConfig> = {
  "book-pdf": {
    value: "book-pdf",
    label: "Book - PDF",
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxSizeBytes: 100 * 1024 * 1024, // 100MB
  },
  "book-epub": {
    value: "book-epub",
    label: "Book - ePub",
    mimeTypes: ["application/epub+zip"],
    extensions: [".epub"],
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
  },
};

/**
 * Get accepted MIME types for a file type
 */
export function getAcceptedMimeTypes(fileType: UploadFileType): string[] {
  return FILE_TYPE_CONFIGS[fileType].mimeTypes;
}

/**
 * Get accepted file extensions for a file type
 */
export function getAcceptedExtensions(fileType: UploadFileType): string[] {
  return FILE_TYPE_CONFIGS[fileType].extensions;
}

/**
 * Validate file against type configuration
 */
export function validateFileForType(
  file: File,
  fileType: UploadFileType,
): { valid: true } | { valid: false; error: string } {
  const config = FILE_TYPE_CONFIGS[fileType];

  // Check file size
  if (file.size > config.maxSizeBytes) {
    const maxSizeMB = Math.round(config.maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds maximum of ${maxSizeMB}MB for ${config.label}`,
    };
  }

  // Check MIME type
  if (!config.mimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Expected ${config.mimeTypes.join(" or ")} for ${config.label}`,
    };
  }

  // Check extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = config.extensions.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file extension. Expected ${config.extensions.join(" or ")} for ${config.label}`,
    };
  }

  return { valid: true };
}
