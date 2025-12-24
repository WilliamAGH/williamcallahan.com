/**
 * Upload Feature Component Props
 * @module types/features/upload
 * @description
 * Type definitions for the file upload feature components.
 * Supports uploading books (PDF, ePub) for processing into the Chroma vector store.
 */

import type { WindowStateValue } from "@/types/ui/window";

// =============================================================================
// FILE TYPE DEFINITIONS
// =============================================================================

/**
 * Supported file types for upload
 */
export type UploadFileType = "book-pdf" | "book-epub";

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
 * Upload status states
 */
export type UploadStatus = "idle" | "validating" | "uploading" | "processing" | "success" | "error";

/**
 * Upload progress information
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
 * Props for the DropZone component
 */
export interface DropZoneProps {
  onFileDrop: (file: File) => void;
  acceptedTypes: string[];
  isDisabled?: boolean;
  isDragActive?: boolean;
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
 * Props for the UploadProgress component
 */
export interface UploadProgressProps {
  progress: UploadProgress;
  fileName?: string;
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
