/**
 * Development-only stub for @aws-sdk/client-s3 to keep AWS SDK out of the dev bundle graph.
 *
 * Reads are implemented via unsigned HTTP requests against the configured S3-compatible endpoint.
 * Writes throw to avoid accidental mutations during local development.
 *
 * This file is aliased in next.config.ts for NODE_ENV=development only.
 */

import { Readable } from "node:stream";

const createS3StubError = (params: {
  method: string;
  url: string;
  status: number;
  statusText: string;
  overrideName?: "NotFound" | "S3StubError" | "S3StubWriteBlocked";
}): Error & {
  name: "NotFound" | "S3StubError" | "S3StubWriteBlocked";
  $metadata: { httpStatusCode: number };
} => {
  const { method, url, status, statusText, overrideName } = params;
  const error = new Error(`${method} ${url} failed: ${status} ${statusText}`) as Error & {
    name: "NotFound" | "S3StubError" | "S3StubWriteBlocked";
    $metadata: { httpStatusCode: number };
  };
  error.name = overrideName ?? (status === 404 ? "NotFound" : "S3StubError");
  error.$metadata = { httpStatusCode: status };
  return error;
};

// Minimal command shapes used by our codebase
export class GetObjectCommand {
  constructor(public input: { Bucket: string; Key: string; Range?: string }) {}
}
export class HeadObjectCommand {
  constructor(public input: { Bucket: string; Key: string }) {}
}
export class PutObjectCommand {
  // Keep signature compatible with callers that may pass Body/ContentType
  constructor(public input: { Bucket: string; Key: string; Body?: unknown; ContentType?: string; ACL?: string }) {}
}
export class ListObjectsV2Command {
  constructor(public input: { Bucket: string; Prefix?: string; ContinuationToken?: string }) {}
}
export class DeleteObjectCommand {
  constructor(public input: { Bucket: string; Key: string }) {}
}

export class S3Client {
  private endpoint: string | undefined;
  private region: string | undefined;
  private forcePathStyle = true;

  constructor(
    cfg: {
      region?: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {},
  ) {
    this.endpoint = cfg.endpoint || process.env.S3_SERVER_URL;
    this.region = cfg.region || process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
    this.forcePathStyle = cfg.forcePathStyle !== false; // default true
  }

  async send(cmd: unknown): Promise<any> {
    if (cmd instanceof GetObjectCommand) return this.handleGetObject(cmd);
    if (cmd instanceof HeadObjectCommand) return this.handleHeadObject(cmd);
    if (cmd instanceof ListObjectsV2Command) return this.handleListObjects(cmd);
    if (cmd instanceof DeleteObjectCommand) return this.handleDeleteObject(cmd);
    if (cmd instanceof PutObjectCommand) return this.handlePutObject(cmd);
    throw new Error("Unsupported S3 command in dev stub");
  }

  private buildUrl(bucket: string, key: string): string {
    const endpoint = (this.endpoint || "").replace(/\/$/, "");
    if (!bucket) throw new Error("S3 stub: S3_BUCKET not configured");
    if (!endpoint) throw new Error("S3 stub: S3_SERVER_URL not configured");
    // Use path-style to avoid virtual host TLS/cert mismatches
    return `${endpoint}/${bucket}/${key}`;
  }

  private async handleGetObject(cmd: GetObjectCommand) {
    const url = this.buildUrl(cmd.input.Bucket, cmd.input.Key);
    const headers: Record<string, string> = { "User-Agent": "S3Stub/1.0" };
    if (cmd.input.Range) headers["Range"] = cmd.input.Range;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw createS3StubError({ method: "GET", url, status: res.status, statusText: res.statusText });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || undefined;

    return {
      Body: Readable.from(buffer),
      ContentType: contentType,
    };
  }

  private async handleHeadObject(cmd: HeadObjectCommand) {
    const url = this.buildUrl(cmd.input.Bucket, cmd.input.Key);
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": "S3Stub/1.0" } });
    if (!res.ok) {
      throw createS3StubError({ method: "HEAD", url, status: res.status, statusText: res.statusText });
    }
    const lenStr = res.headers.get("content-length");
    const type = res.headers.get("content-type") || undefined;
    const lm = res.headers.get("last-modified");
    return {
      ContentLength: lenStr ? Number(lenStr) : undefined,
      ContentType: type,
      LastModified: lm ? new Date(lm) : undefined,
    };
  }

  private handleListObjects(_cmd: ListObjectsV2Command) {
    // Dev stub: avoid listing (requires auth). Return empty to keep callers safe.
    return { Contents: [], NextContinuationToken: undefined };
  }

  private handleDeleteObject(_cmd: DeleteObjectCommand) {
    // No-op in dev
    return {};
  }

  private handlePutObject(_cmd: PutObjectCommand) {
    throw createS3StubError({
      method: "PUT",
      url: "s3://development-write-block",
      status: 403,
      statusText: "Writes disabled in development",
      overrideName: "S3StubWriteBlocked",
    });
  }
}
