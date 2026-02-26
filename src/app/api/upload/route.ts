/**
 * File Upload API Route
 * @module app/api/upload/route
 * @description
 * Handles file uploads for books (PDF, ePub) to S3 storage.
 *
 * Pipeline:
 * 1. Validate file type and size
 * 2. Upload to S3
 * 3. Parse content (ePub or PDF) to validate the file and extract basic stats
 */

import { NextResponse } from "next/server";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { deleteFromS3 } from "@/lib/s3/objects";
import {
  UploadFileTypeSchema,
  FILE_TYPE_CONFIGS,
  validateFileForType,
  type UploadFileType,
} from "@/types/schemas/upload";
import { parseEpubFromBuffer } from "@/lib/books/epub-parser";
import { parsePdfFromBuffer } from "@/lib/books/pdf-parser";
import { z } from "zod/v4";
import { requireCloudflareHeaders } from "@/lib/utils/api-utils";

// Maximum file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * CORS headers for cross-origin requests
 * Required on all responses, not just OPTIONS preflight
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/**
 * Generate S3 key for uploaded file
 */
function generateS3Key(fileType: UploadFileType, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-");

  const prefix = fileType === "book-pdf" ? "books/pdf" : "books/epub";
  return `${prefix}/${timestamp}-${sanitizedName}`;
}

/**
 * Get content type for file type
 */
function getContentType(fileType: UploadFileType): string {
  const mimeType = FILE_TYPE_CONFIGS[fileType].mimeTypes[0];
  return mimeType ?? "application/octet-stream";
}

/**
 * Process ePub file: parse for validation + stats.
 */
async function processEpubFile(
  buffer: Buffer,
): Promise<{ chunksIndexed: number; totalWords: number }> {
  const parsed = await parseEpubFromBuffer(buffer, { includeHtml: false });

  return {
    chunksIndexed: 0,
    totalWords: parsed.totalWordCount,
  };
}

/**
 * Process PDF file: parse for validation + stats.
 */
async function processPdfFile(
  buffer: Buffer,
): Promise<{ chunksIndexed: number; totalWords: number }> {
  const parsed = await parsePdfFromBuffer(buffer);

  return {
    chunksIndexed: 0,
    totalWords: parsed.totalWordCount,
  };
}

/**
 * POST handler for file uploads
 */
export async function POST(request: Request): Promise<Response> {
  const cloudflareResponse = requireCloudflareHeaders(request.headers, {
    route: "/api/upload",
    additionalHeaders: CORS_HEADERS,
  });
  if (cloudflareResponse) {
    return cloudflareResponse;
  }

  const startTime = Date.now();
  let s3Key: string | null = null;
  let uploadCompleted = false;

  try {
    const contentTypeHeader = request.headers.get("content-type");
    if (!contentTypeHeader?.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported Media Type: expected multipart/form-data",
        },
        { status: 415, headers: CORS_HEADERS },
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file");
    const fileTypeRaw = formData.get("fileType");

    // Validate file presence
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Validate file type parameter
    const fileTypeResult = UploadFileTypeSchema.safeParse(fileTypeRaw);
    if (!fileTypeResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid file type specified" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    const fileType = fileTypeResult.data;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Validate file against type configuration
    const validation = validateFileForType(file, fileType);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Generate S3 key
    s3Key = generateS3Key(fileType, file.name);
    const contentType = getContentType(fileType);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    await writeBinaryS3(s3Key, buffer, contentType);
    uploadCompleted = true;

    // Process and index based on file type
    let processingResult: { chunksIndexed: number; totalWords: number };

    try {
      if (fileType === "book-epub") {
        processingResult = await processEpubFile(buffer);
      } else if (fileType === "book-pdf") {
        processingResult = await processPdfFile(buffer);
      } else {
        // Shouldn't happen due to validation, but handle gracefully
        return NextResponse.json(
          {
            success: true,
            s3Key,
            message: "File uploaded but not processed (unsupported type for processing)",
            vectorIndexStatus: "skipped",
          },
          { headers: CORS_HEADERS },
        );
      }
    } catch (processingError) {
      if (uploadCompleted && s3Key) {
        try {
          await deleteFromS3(s3Key);
          console.log(`[Upload API] Cleaned up S3 file after processing failure: ${s3Key}`);
        } catch (cleanupError) {
          console.error(`[Upload API] Failed to clean up S3 file ${s3Key}:`, cleanupError);
        }
      }
      throw processingError;
    }

    const processingTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        s3Key,
        message: "File uploaded successfully (vector indexing is disabled)",
        vectorIndexStatus: "disabled",
        stats: {
          chunksIndexed: processingResult.chunksIndexed,
          totalWords: processingResult.totalWords,
          processingTimeMs,
        },
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[Upload API] Error:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
