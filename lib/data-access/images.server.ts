import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";

const s3Client = new S3Client({ region: env.AWS_REGION });

/**
 * Fetches an image buffer from S3, cached using Next.js Data Cache.
 * Images are considered immutable and cached for a long duration.
 *
 * @param key The S3 object key.
 * @returns A Promise that resolves to the image buffer.
 */
export async function getCachedS3Image(key: string): Promise<Buffer> {
  "use cache";

  cacheLife('weeks'); // Use predefined profile for consistency
  cacheTag("image");
  cacheTag(`image-key-${key}`);

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
    console.error(`Failed to fetch image from S3 with key: ${key}`, error);
    throw error;
  }
}
