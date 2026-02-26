import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { jsonDocuments } from "@/lib/db/schema/json-documents";
import { S3OperationError } from "@/lib/s3/errors";
import { safeJsonStringify } from "@/lib/utils/json-utils";

function serializePayload(payload: unknown): { serialized: string; parsed: unknown } {
  const serialized = safeJsonStringify(payload);
  if (!serialized) {
    throw new S3OperationError("Failed to serialize JSON payload for database persistence.", {
      operation: "writeJsonS3",
    });
  }

  try {
    return {
      serialized,
      parsed: JSON.parse(serialized),
    };
  } catch (error) {
    throw new S3OperationError(
      "Serialized JSON payload is invalid before database persistence.",
      { operation: "writeJsonS3" },
      error,
    );
  }
}

function createEtag(serializedPayload: string): string {
  return createHash("md5").update(serializedPayload).digest("hex");
}

export async function upsertJsonDocument(params: {
  key: string;
  payload: unknown;
  contentType?: string;
  ifNoneMatch?: "*";
}): Promise<void> {
  assertDatabaseWriteAllowed(`upsertJsonDocument:${params.key}`);

  const normalizedPayload = serializePayload(params.payload);
  const now = Date.now();
  const contentType = params.contentType ?? "application/json";
  const eTag = createEtag(normalizedPayload.serialized);
  const contentLength = Buffer.byteLength(normalizedPayload.serialized, "utf-8");

  if (params.ifNoneMatch === "*") {
    const inserted = await db
      .insert(jsonDocuments)
      .values({
        key: params.key,
        payload: normalizedPayload.parsed,
        contentType,
        eTag,
        contentLength,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ key: jsonDocuments.key });

    if (!inserted[0]) {
      throw new S3OperationError(`Precondition failed for key ${params.key}: row already exists.`, {
        operation: "writeJsonS3",
        key: params.key,
        code: "PreconditionFailed",
        httpStatus: 412,
      });
    }
    return;
  }

  await db
    .insert(jsonDocuments)
    .values({
      key: params.key,
      payload: normalizedPayload.parsed,
      contentType,
      eTag,
      contentLength,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: jsonDocuments.key,
      set: {
        payload: normalizedPayload.parsed,
        contentType,
        eTag,
        contentLength,
        updatedAt: now,
      },
    });
}

export async function deleteJsonDocumentByKey(key: string): Promise<void> {
  assertDatabaseWriteAllowed(`deleteJsonDocumentByKey:${key}`);

  await db.delete(jsonDocuments).where(eq(jsonDocuments.key, key));
}
