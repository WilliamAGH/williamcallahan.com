import { S3Client as AwsS3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

// Read configuration explicitly from environment variables
const s3Bucket = process.env.S3_BUCKET;
const s3Endpoint = process.env.S3_SERVER_URL; // Use S3_SERVER_URL for endpoint
const s3Region = process.env.AWS_REGION; // Use AWS_REGION for region
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

// Basic check if essential config is present
const hasS3Config = !!(s3Bucket && s3Region && s3AccessKeyId && s3SecretAccessKey);

if (!hasS3Config) {
  console.warn(`[lib/s3] WARNING: Missing one or more S3 environment variables (S3_BUCKET, AWS_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3 client might not function correctly.`);
}

// Create AWS S3 client
const awsS3Client = new AwsS3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKeyId || '',
    secretAccessKey: s3SecretAccessKey || '',
  }
});

/**
 * S3 File class that mimics Bun's S3File API
 * Provides a compatibility layer over AWS SDK v3
 */
class S3File {
  private readonly key: string;
  private readonly bucket: string;
  private readonly client: AwsS3Client;

  constructor(key: string, bucket: string, client: AwsS3Client) {
    this.key = key;
    this.bucket = bucket;
    this.client = client;
  }

  /**
   * Fetches the file content as JSON
   */
  async json<T = unknown>(): Promise<T> {
    const text = await this.text();
    return JSON.parse(text) as T;
  }

  /**
   * Fetches the file content as text
   */
  async text(): Promise<string> {
    const buffer = await this.arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  /**
   * Fetches the file content as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${s3Endpoint}/${this.bucket}/${this.key}`, {
        headers: {
          "Authorization": `Basic ${Buffer.from(`${s3AccessKeyId}:${s3SecretAccessKey}`).toString('base64')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error(`[S3File] Error fetching ${this.key}:`, error);
      throw error;
    }
  }

  /**
   * Writes data to the S3 file
   */
  async write(data: string | ArrayBuffer | Blob): Promise<void> {
    let body: string | ArrayBuffer;

    if (typeof data === 'string') {
      body = data;
    } else if (data instanceof ArrayBuffer) {
      body = data;
    } else if (data instanceof Blob) {
      body = await data.arrayBuffer();
    } else {
      throw new Error('Unsupported data type for S3 write');
    }

    try {
      const response = await fetch(`${s3Endpoint}/${this.bucket}/${this.key}`, {
        method: 'PUT',
        headers: {
          "Authorization": `Basic ${Buffer.from(`${s3AccessKeyId}:${s3SecretAccessKey}`).toString('base64')}`,
          "Content-Type": typeof data === 'string' ? 'text/plain' : 'application/octet-stream',
          // Ensure objects are publicly readable upon upload
          "x-amz-acl": "public-read",
        },
        body
      });

      if (!response.ok) {
        throw new Error(`Failed to write file: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[S3File] Error writing ${this.key}:`, error);
      throw error;
    }
  }

  /**
   * Deletes the S3 file
   */
  async delete(): Promise<void> {
    try {
      const response = await fetch(`${s3Endpoint}/${this.bucket}/${this.key}`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Basic ${Buffer.from(`${s3AccessKeyId}:${s3SecretAccessKey}`).toString('base64')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[S3File] Error deleting ${this.key}:`, error);
      throw error;
    }
  }
}

/**
 * S3Client compatibility class that provides a similar API to Bun's S3Client
 */
class S3Client {
  private readonly bucket: string;
  private readonly awsClient: AwsS3Client;

  constructor(config: { bucket: string, awsClient: AwsS3Client }) {
    this.bucket = config.bucket || '';
    this.awsClient = config.awsClient;
  }

  /**
   * Returns a reference to a file in S3
   */
  file(key: string): S3File {
    return new S3File(key, this.bucket, this.awsClient);
  }

  /**
   * Lists objects in the S3 bucket
   */
  async list(options?: {
    Prefix?: string;
    Delimiter?: string;
    MaxKeys?: number;
    ContinuationToken?: string;
    StartAfter?: string;
  }): Promise<{
    contents?: { key?: string; lastModified?: string; eTag?: string; size?: number }[];
    commonPrefixes?: { prefix?: string }[];
    isTruncated?: boolean;
    nextContinuationToken?: string;
  }> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.Prefix,
        Delimiter: options?.Delimiter,
        MaxKeys: options?.MaxKeys,
        ContinuationToken: options?.ContinuationToken,
        StartAfter: options?.StartAfter
      });

      const response = await this.awsClient.send(command);

      return {
        contents: response.Contents?.map(item => ({
          key: item.Key,
          lastModified: item.LastModified?.toISOString(),
          eTag: item.ETag,
          size: item.Size
        })),
        commonPrefixes: response.CommonPrefixes?.map(prefix => ({
          prefix: prefix.Prefix
        })),
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken
      };
    } catch (error) {
      console.error(`[S3Client] Error listing objects:`, error);
      throw error;
    }
  }
}

/**
 * Shared S3 client instance for interacting with S3-compatible storage.
 * Initialized with explicit configuration from environment variables.
 *
 * Methods:
 * - `file(key: string)`: Returns a lazy reference to an object in S3.
 *   - `.json()`: Downloads and parses the object as JSON.
 *   - `.text()`: Downloads and returns the object as text.
 *   - `.arrayBuffer()`: Downloads and returns the object as an ArrayBuffer.
 *   - `.delete()`: Deletes the object from S3.
 *   - `.write(data: string | ArrayBuffer | Blob)`: Uploads data to the S3 object.
 * - `list(options?: { Prefix?: string; Delimiter?: string; MaxKeys?: number; ContinuationToken?: string; StartAfter?: string; }): Promise<S3ListObjectsResponse>`:
 *   Lists objects in the configured S3 bucket. Supports options for filtering and pagination, similar to AWS S3 ListObjectsV2.
 *
 * @example
 * ```typescript
 * import { s3Client } from '@/lib/s3';
 *
 * // Read a JSON file
 * const jsonData = await s3Client.file('path/to/your/object.json').json();
 *
 * // Write a text file
 * const s3Object = s3Client.file('path/to/new/object.txt');
 * await s3Object.write("Hello from S3!");
 *
 * // List objects with a prefix
 * const listedObjects = await s3Client.list({ Prefix: 'path/to/folder/' });
 * if (listedObjects.contents) {
 *   for (const item of listedObjects.contents) {
 *     console.log(item.key);
 *   }
 * }
 * ```
 */
export const s3Client = new S3Client({
  bucket: s3Bucket || '',
  awsClient: awsS3Client
});

// Export the write helper function to maintain compatibility with code using Bun's write()
export async function write(file: S3File, data: string | ArrayBuffer | Blob): Promise<void> {
  return file.write(data);
}