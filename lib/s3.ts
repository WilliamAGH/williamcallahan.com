/**
 * @file S3 Client Initialization and Utilities
 *
 * Initializes and exports a shared AWS S3 client instance with compatibility layer for Bun S3 API.
 * This client is configured using environment variables:
 * - S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID
 * - S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY
 * - S3_REGION or AWS_REGION
 * - S3_ENDPOINT or AWS_ENDPOINT
 * - S3_BUCKET or AWS_BUCKET (this is the default bucket the client will operate on)
 * - S3_SESSION_TOKEN or AWS_SESSION_TOKEN
 *
 * This implementation provides a compatibility layer over AWS SDK to mimic Bun's S3 API,
 * ensuring it works with Next.js in both webpack and Bun environments.
 */

import { listS3Objects as awsListS3Objects, deleteFromS3, readFromS3, writeJsonS3, writeToS3 } from "@/lib/s3-utils";
import type { S3ClientWrapper } from "@/types/s3";
import { S3Client as AwsS3Client } from "@aws-sdk/client-s3";

// Environment variables for S3 configuration
const bucket = process.env.S3_BUCKET || "";
const endpoint = process.env.S3_SERVER_URL || "";
const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
const sessionToken = process.env.S3_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN || undefined;

if (!bucket || !accessKeyId || !secretAccessKey) {
  console.warn(
    "[lib/s3] Missing required S3 environment variables (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).",
  );
}

// Export a Bun-compatible S3 client: prefer Bun's native S3Client, fallback to AWS SDK with polyfill
export const s3Client: S3ClientWrapper = (() => {
  // Use AWS SDK as the primary client
  const awsClient = new AwsS3Client({
    region: region || undefined,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey, sessionToken },
    forcePathStyle: !!endpoint,
  });
  const client = awsClient as AwsS3Client & S3ClientWrapper;

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
