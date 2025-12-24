/**
 * Upload Window Client Component
 * @module components/features/upload/upload-window.client
 * @description
 * Client-side file upload interface with macOS-style window chrome.
 * Supports drag-and-drop file uploads for books (PDF, ePub) to S3
 * with subsequent Chroma vector store processing.
 *
 * Design: "Technical Document Archive" aesthetic - refined, utilitarian,
 * with monospace typography and geometric elements.
 */

"use client";

import React, { useState, useCallback, useRef, Suspense } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { RegisteredWindowState } from "@/types";
import { FILE_TYPE_CONFIGS, validateFileForType, type UploadFileType } from "@/types/schemas/upload";
import type {
  UploadStatus,
  UploadWindowProps,
  UploadWindowContentProps,
  FileTypeSelectorProps,
  DropZoneProps,
  UploadProgressIndicatorProps,
} from "@/types/features/upload";

const DEFAULT_UPLOAD_WINDOW_ID = "upload-window";

// =============================================================================
// FILE TYPE SELECTOR
// =============================================================================

function FileTypeSelector({ value, onChange, isDisabled }: FileTypeSelectorProps) {
  const options = Object.values(FILE_TYPE_CONFIGS);

  return (
    <div className="relative">
      <label
        htmlFor="file-type-select"
        className="block text-xs font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2"
      >
        Document Type
      </label>
      <select
        id="file-type-select"
        value={value}
        onChange={e => onChange(e.target.value as UploadFileType)}
        disabled={isDisabled}
        className={cn(
          "w-full px-4 py-3 font-mono text-sm",
          "bg-gray-50 dark:bg-gray-800/50",
          "border-2 border-gray-200 dark:border-gray-700",
          "rounded-lg",
          "text-gray-900 dark:text-gray-100",
          "focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400",
          "focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20",
          "transition-all duration-200",
          "cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          // Custom arrow styling
          "appearance-none",
          "bg-no-repeat bg-right",
          "pr-10",
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundPosition: "right 12px center",
        }}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// DROP ZONE
// =============================================================================

function DropZone({
  onFileDrop,
  acceptedExtensions,
  acceptedMimeTypes,
  isDisabled,
  selectedFile,
  validationError,
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (isDisabled) return;

      const files = e.dataTransfer.files;
      const firstFile = files[0];
      if (firstFile) {
        onFileDrop(firstFile);
      }
    },
    [isDisabled, onFileDrop],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const firstFile = files?.[0];
      if (firstFile) {
        onFileDrop(firstFile);
      }
    },
    [onFileDrop],
  );

  const handleClick = useCallback(() => {
    if (!isDisabled) {
      inputRef.current?.click();
    }
  }, [isDisabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [isDisabled],
  );

  return (
    <div className="relative">
      <label className="block text-xs font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Select File
      </label>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={acceptedMimeTypes.join(",")}
        onChange={handleFileSelect}
        disabled={isDisabled}
        className="hidden"
        aria-label="File upload input"
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "relative overflow-hidden",
          "min-h-[200px]",
          "rounded-xl",
          "border-2 border-dashed",
          "transition-all duration-300 ease-out",
          "cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
          // Geometric background pattern
          "bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/30 dark:to-gray-900/50",
          // State-based styling
          isDisabled && "opacity-50 cursor-not-allowed",
          isDragActive
            ? "border-emerald-500 dark:border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20 scale-[1.02]"
            : validationError
              ? "border-red-400 dark:border-red-500"
              : selectedFile
                ? "border-emerald-400 dark:border-emerald-500"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
        )}
      >
        {/* Geometric grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full min-h-[200px] p-8">
          {selectedFile ? (
            <>
              <div
                className={cn(
                  "w-16 h-16 rounded-xl flex items-center justify-center mb-4",
                  "bg-emerald-100 dark:bg-emerald-900/30",
                  "text-emerald-600 dark:text-emerald-400",
                )}
              >
                <FileText className="w-8 h-8" />
              </div>
              <p className="font-mono text-sm text-gray-900 dark:text-gray-100 mb-1 text-center break-all max-w-full px-4">
                {selectedFile.name}
              </p>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{formatFileSize(selectedFile.size)}</p>
              {validationError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400 text-center">{validationError}</p>
              )}
            </>
          ) : (
            <>
              <div
                className={cn(
                  "w-16 h-16 rounded-xl flex items-center justify-center mb-4",
                  "bg-gray-200/50 dark:bg-gray-700/50",
                  "text-gray-400 dark:text-gray-500",
                  "transition-all duration-300",
                  isDragActive &&
                    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400 scale-110",
                )}
              >
                <Upload className="w-8 h-8" />
              </div>
              <p className="font-mono text-sm text-gray-600 dark:text-gray-300 mb-1">
                {isDragActive ? "Drop file here" : "Drag & drop or click to browse"}
              </p>
              <p className="font-mono text-xs text-gray-400 dark:text-gray-500">
                Accepted: {acceptedExtensions.join(", ")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UPLOAD PROGRESS
// =============================================================================

function UploadProgressIndicator({ status, progress, message }: UploadProgressIndicatorProps) {
  if (status === "idle") return null;

  const getStatusIcon = () => {
    switch (status) {
      case "validating":
      case "uploading":
      case "processing":
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case "success":
        return <CheckCircle2 className="w-5 h-5" />;
      case "error":
        return <AlertCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "success":
        return "text-emerald-600 dark:text-emerald-400";
      case "error":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-blue-600 dark:text-blue-400";
    }
  };

  const getProgressColor = () => {
    switch (status) {
      case "success":
        return "bg-emerald-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-3">
        <span className={getStatusColor()}>{getStatusIcon()}</span>
        <span className={cn("font-mono text-sm", getStatusColor())}>{message}</span>
      </div>

      {(status === "uploading" || status === "processing") && (
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out",
              getProgressColor(),
            )}
            style={{ width: `${progress}%` }}
          />
          {/* Animated shine effect */}
          <div
            className="absolute inset-y-0 left-0 w-full animate-pulse"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
              animation: "shimmer 2s infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// UPLOAD WINDOW CONTENT
// =============================================================================

function UploadWindowContentInner({
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  windowTitle,
}: UploadWindowContentProps): React.JSX.Element {
  const isMaximized = windowState === "maximized";
  const formattedTitle = windowTitle ?? "~/upload";

  // State
  const [fileType, setFileType] = useState<UploadFileType>("book-pdf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const config = FILE_TYPE_CONFIGS[fileType];

  // Handle file selection
  const handleFileDrop = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setValidationError(null);
      setUploadStatus("idle");

      // Validate the file
      const validation = validateFileForType(file, fileType);
      if (!validation.valid) {
        setValidationError(validation.error);
      }
    },
    [fileType],
  );

  // Handle file type change
  const handleFileTypeChange = useCallback(
    (newType: UploadFileType) => {
      setFileType(newType);
      // Re-validate if a file is selected
      if (selectedFile) {
        const validation = validateFileForType(selectedFile, newType);
        if (!validation.valid) {
          setValidationError(validation.error);
        } else {
          setValidationError(null);
        }
      }
    },
    [selectedFile],
  );

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!selectedFile || validationError) return;

    setUploadStatus("validating");
    setUploadProgress(0);
    setStatusMessage("Validating file...");

    try {
      // Simulate validation delay
      await new Promise(resolve => setTimeout(resolve, 500));

      setUploadStatus("uploading");
      setStatusMessage("Uploading to storage...");

      // Create form data
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileType", fileType);

      // Upload with progress tracking
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", e => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.responseText || "Upload failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));

        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });

      setUploadStatus("processing");
      setUploadProgress(100);
      setStatusMessage("Processing document for vector storage...");

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      setUploadStatus("success");
      setStatusMessage("Document uploaded and indexed successfully!");
    } catch (error) {
      setUploadStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Upload failed");
    }
  }, [selectedFile, validationError, fileType]);

  // Reset form
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    setUploadStatus("idle");
    setUploadProgress(0);
    setStatusMessage("");
  }, []);

  const isUploading = uploadStatus === "validating" || uploadStatus === "uploading" || uploadStatus === "processing";
  const canUpload = selectedFile && !validationError && !isUploading;

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40"
          : "relative max-w-2xl mx-auto mt-8",
      )}
    >
      {/* Window header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
            <h1 className="text-xl font-mono ml-4">
              <Link href="/upload-file" className="hover:underline">
                {formattedTitle}
              </Link>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Document Archive
            </span>
          </div>
        </div>
      </div>

      {/* Window content */}
      <div className={cn("p-6", isMaximized ? "overflow-y-auto h-[calc(100%-64px)]" : "")}>
        {/* Intro text */}
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            Upload books to the document archive. Files are stored securely and processed for semantic search via vector
            embeddings.
          </p>
        </div>

        {/* File type selector */}
        <div className="mb-6">
          <FileTypeSelector value={fileType} onChange={handleFileTypeChange} isDisabled={isUploading} />
        </div>

        {/* Drop zone */}
        <div className="mb-6">
          <DropZone
            onFileDrop={handleFileDrop}
            acceptedExtensions={config.extensions}
            acceptedMimeTypes={config.mimeTypes}
            isDisabled={isUploading}
            selectedFile={selectedFile}
            validationError={validationError}
          />
        </div>

        {/* Upload progress */}
        <UploadProgressIndicator status={uploadStatus} progress={uploadProgress} message={statusMessage} />

        {/* Action buttons */}
        <div className="mt-6 flex gap-3">
          {uploadStatus === "success" ? (
            <button
              type="button"
              onClick={handleReset}
              className={cn(
                "flex-1 px-6 py-3 font-mono text-sm",
                "bg-emerald-600 hover:bg-emerald-700",
                "text-white",
                "rounded-lg",
                "transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
              )}
            >
              Upload Another
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!canUpload}
                className={cn(
                  "flex-1 px-6 py-3 font-mono text-sm",
                  "bg-emerald-600 hover:bg-emerald-700",
                  "text-white",
                  "rounded-lg",
                  "transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600",
                  "flex items-center justify-center gap-2",
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload & Index
                  </>
                )}
              </button>
              {selectedFile && !isUploading && (
                <button
                  type="button"
                  onClick={handleReset}
                  className={cn(
                    "px-6 py-3 font-mono text-sm",
                    "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700",
                    "text-gray-700 dark:text-gray-300",
                    "rounded-lg",
                    "transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-gray-500/50",
                  )}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UPLOAD WINDOW (Main Export)
// =============================================================================

export function UploadWindow({ windowTitle, windowId }: UploadWindowProps) {
  const uniqueId = windowId ?? DEFAULT_UPLOAD_WINDOW_ID;
  const restoreTitle = "Restore Upload";

  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  }: RegisteredWindowState = useRegisteredWindowState(uniqueId, Upload as LucideIcon, restoreTitle, "normal");

  // Closed or minimized windows are hidden
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <Suspense fallback={<div className="min-h-[400px] animate-pulse" />}>
      <UploadWindowContentInner
        windowState={isRegistered ? windowState : "normal"}
        onClose={closeWindow}
        onMinimize={minimizeWindow}
        onMaximize={maximizeWindow}
        windowTitle={windowTitle}
      />
    </Suspense>
  );
}

// =============================================================================
// UTILITIES
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
