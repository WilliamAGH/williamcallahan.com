/**
 * @file S3 Client Initialization and Utilities
 *
 * Initializes and exports a shared AWS S3 client instance with compatibility layer for Bun S3 API
 * (Session tokens are no longer supported; all credentials come from permanent key & secret)
 *
 * This implementation provides a compatibility layer over AWS SDK to mimic Bun's S3 API,
 * ensuring it works with Next.js in both webpack and Bun environments.
 */

import { listS3Objects as awsListS3Objects, deleteFromS3, readFromS3, writeJsonS3, writeToS3, s3Client as s3UtilsClient } from "@/lib/s3-utils";
import type { S3ClientWrapper } from "@/types/s3-cdn";
import type { S3Client as AwsS3Client } from "@aws-sdk/client-s3";

// Environment variables for S3 configuration
const bucket = process.env.S3_BUCKET || "";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";

if (!bucket || !accessKeyId || !secretAccessKey) {
  console.warn(
    "[lib/s3] Missing required S3 environment variables (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).",
  );
}

// Export a Bun-compatible S3 client wrapper using the singleton from s3-utils
export const s3Client: S3ClientWrapper = (() => {
  // Reuse the existing S3 client from s3-utils instead of creating a new one
  const client = s3UtilsClient as unknown as AwsS3Client & S3ClientWrapper;
  
  if (!client) {
    console.warn("[lib/s3] S3 client not available from s3-utils");
    // Return a minimal implementation that throws errors
    return {
      file: () => { throw new Error("S3 not configured"); },
      list: () => Promise.resolve({ contents: [], isTruncated: false }),
    } as S3ClientWrapper;
  }

  // Polyfill file() method
  client.file = (key: string) => {
    let parts: (string | Buffer)[] = [];
    return {
      key,
      async json<T = unknown>(): Promise<T | null> {
        try {
          const body = await readFromS3(key);
          if (typeof body === "string") return JSON.parse(body) as T;
          if (body instanceof Buffer) return JSON.parse(body.toString("utf-8")) as T;
        } catch {
          // ignore JSON parse or read errors
        }
        return null;
      },
      async text(): Promise<string> {
        const body = await readFromS3(key);
        if (typeof body === "string") return body;
        if (body instanceof Buffer) return body.toString("utf-8");
        return "";
      },
      async arrayBuffer(): Promise<ArrayBuffer> {
        const body = await readFromS3(key);
        if (body instanceof Buffer) {
          const ab = body.buffer as ArrayBuffer;
          return ab.slice(body.byteOffset, body.byteOffset + body.byteLength);
        }
        if (typeof body === "string") {
          const enc = new TextEncoder().encode(body);
          return enc.buffer as ArrayBuffer;
        }
        return new ArrayBuffer(0);
      },
      async blob(): Promise<Blob> {
        const buf = await this.arrayBuffer();
        return new Blob([buf]);
      },
      async delete(): Promise<void> {
        await deleteFromS3(key);
      },
      slice() {
        return this;
      },
      writer() {
        parts = [];
        return {
          write(chunk: string | ArrayBuffer | ArrayBufferView): number {
            if (typeof chunk === "string") {
              parts.push(chunk);
              return chunk.length;
            }
            const buf = Buffer.from(new Uint8Array(ArrayBuffer.isView(chunk) ? chunk.buffer : chunk));
            parts.push(buf);
            return buf.byteLength;
          },
          async end(): Promise<void> {
            if (parts.length === 0) return;
            const data = parts.every((p) => typeof p === "string")
              ? parts.join("")
              : Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p) : p))).toString("utf-8");
            try {
              await writeJsonS3(key, JSON.parse(data));
            } catch {
              await writeToS3(key, data, "application/json", "public-read");
            }
          },
        };
      },
    };
  };

  // Polyfill list() method
  client.list = async (prefix?: string) => {
    const keys = await awsListS3Objects(prefix || "");
    return { contents: keys.map((key) => ({ key })), isTruncated: false };
  };

  return client; // Return AWS SDK client
})();
