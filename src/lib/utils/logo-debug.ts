/**
 * Logo Debug Utilities
 *
 * Comprehensive debugging for logo fetching and S3 operations
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import { getMonotonicTime } from "@/lib/utils";
import type { LogoDebugInfo } from "@/types/logo";

// Moved interface to @/types/logo.ts

class LogoDebugger {
  private static instance: LogoDebugger;
  private debugInfo: Map<string, LogoDebugInfo> = new Map();
  private isDebugEnabled: boolean;

  private constructor() {
    this.isDebugEnabled =
      process.env.NODE_ENV === "development" || process.env.DEBUG_LOGOS === "true";
  }

  static getInstance(): LogoDebugger {
    if (!LogoDebugger.instance) {
      LogoDebugger.instance = new LogoDebugger();
    }
    return LogoDebugger.instance;
  }

  startDebug(domain: string): void {
    if (!this.isDebugEnabled) return;

    this.debugInfo.set(domain, {
      domain,
      timestamp: getMonotonicTime(),
      attempts: [],
      finalResult: {
        found: false,
      },
    });
  }

  logAttempt(
    domain: string,
    type: LogoDebugInfo["attempts"][0]["type"],
    details: string,
    result: "success" | "failed",
    error?: string,
  ): void {
    if (!this.isDebugEnabled) return;

    const info = this.debugInfo.get(domain);
    if (!info) return;

    info.attempts.push({
      type,
      details,
      result,
      error,
    });
  }

  async performS3Search(
    domain: string,
    s3Client: S3Client | null,
    bucket: string | undefined,
  ): Promise<void> {
    if (!this.isDebugEnabled || !s3Client || !bucket) return;

    const info = this.debugInfo.get(domain);
    if (!info) return;

    try {
      // List all logos in S3
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: IMAGE_S3_PATHS.LOGOS_DIR + "/",
        MaxKeys: 1000,
      });

      const response = await s3Client.send(command);
      const objects = response.Contents || [];

      const matchingDomain: string[] = [];
      const similarDomain: string[] = [];

      // Normalize domain for comparison
      const normalizedDomain = domain.toLowerCase().replace(/[^a-z0-9]/g, "");
      const domainParts = domain.split(".");
      const baseDomain = domainParts[domainParts.length - 2] || domain;

      for (const obj of objects) {
        if (!obj.Key) continue;

        const filename = obj.Key.split("/").pop() || "";
        const filenameLower = filename.toLowerCase();

        // Exact domain match
        if (filenameLower.includes(domain.toLowerCase())) {
          matchingDomain.push(filename);
        }
        // Base domain match (e.g., 'stanford' in 'stanford.edu')
        else if (filenameLower.includes(baseDomain.toLowerCase())) {
          similarDomain.push(filename);
        }
        // Normalized match
        else if (filenameLower.replace(/[^a-z0-9]/g, "").includes(normalizedDomain)) {
          similarDomain.push(filename);
        }
      }

      info.s3Results = {
        totalLogos: objects.length,
        matchingDomains: matchingDomain.slice(0, 10), // Limit to 10 for readability
        potentialMatches: similarDomain.slice(0, 10).map((filename) => ({
          key: filename,
          extractedDomain: filename.split("_")[0] || filename,
          similarity: 0.5, // Placeholder similarity score
        })),
      };

      this.logAttempt(
        domain,
        "s3-list",
        `Listed S3 logos: ${objects.length} total, ${matchingDomain.length} exact matches, ${similarDomain.length} similar`,
        "success",
      );
    } catch (error) {
      this.logAttempt(
        domain,
        "s3-list",
        "Failed to list S3 contents",
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  setFinalResult(
    domain: string,
    found: boolean,
    source?: string,
    cdnUrl?: string,
    error?: string,
  ): void {
    if (!this.isDebugEnabled) return;

    const info = this.debugInfo.get(domain);
    if (!info) return;

    info.finalResult = {
      found,
      source,
      cdnUrl,
      error,
    };
  }

  getDebugInfo(domain: string): LogoDebugInfo | undefined {
    return this.debugInfo.get(domain);
  }

  printDebugInfo(domain: string): void {
    if (!this.isDebugEnabled) return;

    const info = this.debugInfo.get(domain);
    if (!info) return;

    console.log(`\n🔍 Logo Debug Info for: ${domain}`);
    console.log("=".repeat(60));

    console.log("\n📋 Attempts:");
    for (const attempt of info.attempts) {
      const icon = attempt.result === "success" ? "✅" : "❌";
      console.log(`  ${icon} ${attempt.type}: ${attempt.details}`);
      if (attempt.error) {
        console.log(`     Error: ${attempt.error}`);
      }
    }

    if (info.s3Results) {
      console.log("\n📁 S3 Search Results:");
      console.log(`  Total logos in S3: ${info.s3Results.totalLogos}`);

      if (info.s3Results.matchingDomains.length > 0) {
        console.log(`  Exact domain matches:`);
        for (const match of info.s3Results.matchingDomains) {
          console.log(`    - ${match}`);
        }
      }

      if (info.s3Results.potentialMatches.length > 0) {
        console.log(`  Potential matches:`);
        for (const match of info.s3Results.potentialMatches) {
          console.log(
            `    - ${match.key} (domain: ${match.extractedDomain}, similarity: ${match.similarity})`,
          );
        }
      }
    }

    if (info.finalResult) {
      console.log("\n🎯 Final Result:");
      console.log(`  Found: ${info.finalResult.found ? "Yes" : "No"}`);
      if (info.finalResult.found) {
        console.log(`  Source: ${info.finalResult.source}`);
        console.log(`  CDN URL: ${info.finalResult.cdnUrl}`);
      }
      if (info.finalResult.error) {
        console.log(`  Error: ${info.finalResult.error}`);
      }
    }

    console.log("\n" + "=".repeat(60) + "\n");

    // Clean up after printing
    this.debugInfo.delete(domain);
  }

  clear(): void {
    this.debugInfo.clear();
  }
}

export const logoDebugger = LogoDebugger.getInstance();

// Helper function to format hash attempts for debugging
export function formatHashAttempt(
  domain: string,
  hash: string,
  source: string,
  extension: string,
): string {
  const filename = `${domain}_${source}_${hash}.${extension}`;
  return `${filename} (domain: ${domain}, hash: ${hash})`;
}

// Helper function to format S3 key for debugging
export function formatS3Key(key: string): string {
  return key.replace(IMAGE_S3_PATHS.LOGOS_DIR + "/", "");
}
