/**
 * File Upload API Route
 * @module app/api/upload/route
 * @description
 * Handles file uploads for books (PDF, ePub) to S3 storage.
 * After upload, parses the content and indexes into Chroma vector database.
 *
 * Pipeline:
 * 1. Validate file type and size
 * 2. Upload to S3
 * 3. Parse content (ePub or PDF)
 * 4. Chunk text for optimal embedding
 * 5. Index chunks to Chroma
 */

import { NextResponse } from "next/server";
import { writeBinaryS3 } from "@/lib/s3-utils";
import {
  UploadFileTypeSchema,
  FILE_TYPE_CONFIGS,
  validateFileForType,
  type UploadFileType,
} from "@/types/schemas/upload";
import { parseEpubFromBuffer } from "@/lib/books/epub-parser";
import { parsePdfFromBuffer } from "@/lib/books/pdf-parser";
import { chunkChapters } from "@/lib/books/text-chunker";
import { indexBookToChroma } from "@/lib/books/chroma-sync";
import { z } from "zod/v4";

// Maximum file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

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
 * Process ePub file: parse and index to Chroma
 */
async function processEpubFile(buffer: Buffer, s3Key: string): Promise<{ chunksIndexed: number; totalWords: number }> {
  // Parse ePub
  const parsed = await parseEpubFromBuffer(buffer, { includeHtml: false });

  // Convert chapters to chunkable format
  const chapterData = parsed.chapters.map(ch => ({
    id: ch.id,
    title: ch.title,
    text: ch.textContent,
  }));

  // Chunk the text
  const chunks = chunkChapters(chapterData, {
    targetWords: 500,
    maxWords: 750,
    overlapWords: 50,
  });

  // Index to Chroma
  const result = await indexBookToChroma({
    bookId: s3Key,
    metadata: parsed.metadata,
    chunks,
    fileType: "book-epub",
  });

  if (!result.success) {
    throw new Error(result.error ?? "Failed to index book to Chroma");
  }

  return {
    chunksIndexed: result.chunksIndexed,
    totalWords: parsed.totalWordCount,
  };
}

/**
 * Process PDF file: parse and index to Chroma
 */
async function processPdfFile(buffer: Buffer, s3Key: string): Promise<{ chunksIndexed: number; totalWords: number }> {
  // Parse PDF
  const parsed = await parsePdfFromBuffer(buffer);

  // Convert pages to chunkable format (treating pages like chapters)
  const pageData = parsed.pages.map(p => ({
    id: `page-${p.pageNumber}`,
    title: `Page ${p.pageNumber}`,
    text: p.textContent,
  }));

  // Chunk the text
  const chunks = chunkChapters(pageData, {
    targetWords: 500,
    maxWords: 750,
    overlapWords: 50,
  });

  // Index to Chroma
  const result = await indexBookToChroma({
    bookId: s3Key,
    metadata: parsed.metadata,
    chunks,
    fileType: "book-pdf",
  });

  if (!result.success) {
    throw new Error(result.error ?? "Failed to index PDF to Chroma");
  }

  return {
    chunksIndexed: result.chunksIndexed,
    totalWords: parsed.totalWordCount,
  };
}

/**
 * POST handler for file uploads
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file");
    const fileTypeRaw = formData.get("fileType");

    // Validate file presence
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // Validate file type parameter
    const fileTypeResult = UploadFileTypeSchema.safeParse(fileTypeRaw);
    if (!fileTypeResult.success) {
      return NextResponse.json({ success: false, error: "Invalid file type specified" }, { status: 400 });
    }
    const fileType = fileTypeResult.data;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 },
      );
    }

    // Validate file against type configuration
    const validation = validateFileForType(file, fileType);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    // Generate S3 key
    const s3Key = generateS3Key(fileType, file.name);
    const contentType = getContentType(fileType);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    await writeBinaryS3(s3Key, buffer, contentType);

    // Process and index based on file type
    let processingResult: { chunksIndexed: number; totalWords: number };

    if (fileType === "book-epub") {
      processingResult = await processEpubFile(buffer, s3Key);
    } else if (fileType === "book-pdf") {
      processingResult = await processPdfFile(buffer, s3Key);
    } else {
      // Shouldn't happen due to validation, but handle gracefully
      return NextResponse.json({
        success: true,
        s3Key,
        message: "File uploaded but not processed (unsupported type for indexing)",
        chromaStatus: "skipped",
      });
    }

    const processingTimeMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      s3Key,
      message: "File uploaded and indexed successfully",
      chromaStatus: "indexed",
      stats: {
        chunksIndexed: processingResult.chunksIndexed,
        totalWords: processingResult.totalWords,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error("[Upload API] Error:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Validation error", details: error.issues }, { status: 400 });
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
