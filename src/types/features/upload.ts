/**
 * Upload Feature Component Props
 * @module types/features/upload
 * @description
 * Type definitions for the file upload feature components.
 * Supports uploading books (PDF, ePub) for processing into the Chroma vector store.
 *
 * Note: UploadFileType is the canonical type from @/types/schemas/upload.
 * Import directly from there, not from this file.
 */

import type { WindowStateValue } from "@/types/ui/window";
import type { UploadFileType } from "@/types/schemas/upload";

// =============================================================================
// FILE TYPE DEFINITIONS
// =============================================================================

/**
 * File type option for the dropdown selector
 */
export interface FileTypeOption {
  value: UploadFileType;
  label: string;
  mimeTypes: string[];
  extensions: string[];
  icon: "pdf" | "epub";
}

/**
 * Upload status states - shared across upload components
 */
export type UploadStatus = "idle" | "validating" | "uploading" | "processing" | "success" | "error";

/**
 * Upload progress information (used by state management)
 */
export interface UploadProgress {
  status: UploadStatus;
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  message: string;
}

// =============================================================================
// UPLOAD STATE
// =============================================================================

/**
 * State for a single file upload
 */
export interface UploadState {
  file: File | null;
  fileType: UploadFileType;
  progress: UploadProgress;
  error: string | null;
  result: UploadResult | null;
}

/**
 * Result from a successful upload
 */
export interface UploadResult {
  s3Key: string;
  chromaCollectionId?: string;
  documentsIndexed?: number;
  processingTimeMs: number;
}

// =============================================================================
// CLIENT COMPONENT PROPS
// =============================================================================

/**
 * Props for the UploadWindow client component
 */
export interface UploadWindowProps {
  windowTitle?: string;
  windowId?: string;
}

/**
 * Props for the UploadWindowContent internal component
 */
export interface UploadWindowContentProps {
  windowState: WindowStateValue;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  windowTitle?: string;
}

/**
 * Props for the FileTypeSelector component
 */
export interface FileTypeSelectorProps {
  value: UploadFileType;
  onChange: (value: UploadFileType) => void;
  isDisabled?: boolean;
}

/**
 * Props for the DropZone component
 */
export interface DropZoneProps {
  onFileDrop: (file: File) => void;
  acceptedExtensions: string[];
  acceptedMimeTypes: string[];
  isDisabled?: boolean;
  selectedFile: File | null;
  validationError: string | null;
}

/**
 * Props for the UploadProgressIndicator component
 */
export interface UploadProgressIndicatorProps {
  status: UploadStatus;
  progress: number;
  message: string;
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Request body for the upload API
 */
export interface UploadApiRequest {
  fileType: UploadFileType;
  fileName: string;
  fileSize: number;
  contentType: string;
}

/**
 * Response from the upload API
 */
export interface UploadApiResponse {
  success: boolean;
  uploadUrl?: string;
  s3Key?: string;
  error?: string;
}
