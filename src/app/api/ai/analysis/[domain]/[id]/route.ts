/**
 * AI Analysis Persistence API Endpoint
 * @module app/api/ai/analysis/[domain]/[id]/route
 * @description
 * POST endpoint for persisting AI-generated analysis to S3.
 * Rate-limited per IP to prevent abuse.
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { persistAnalysis } from "@/lib/ai-analysis/writer.server";
import { bookmarkAiAnalysisResponseSchema } from "@/types/schemas/bookmark-ai-analysis";
import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { projectAiAnalysisResponseSchema } from "@/types/schemas/project-ai-analysis";
import { persistAnalysisRequestSchema } from "@/types/schemas/ai-analysis-persisted";
import { getClientIp } from "@/lib/utils/request-utils";
import {
  NO_STORE_HEADERS,
  buildApiRateLimitResponse,
  createErrorResponse,
  preventCaching,
} from "@/lib/utils/api-utils";
import { envLogger } from "@/lib/utils/env-logger";
import type { AnalysisDomain } from "@/lib/ai-analysis/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Rate limit: 30 requests per minute per IP */
const PERSIST_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
} as const;

/** Valid analysis domains */
const VALID_DOMAINS = new Set<AnalysisDomain>(["bookmarks", "projects", "books"]);

// ─────────────────────────────────────────────────────────────────────────────
// Schema Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the Zod schema for validating analysis data by domain.
 *
 * @throws Error if domain doesn't have a registered schema yet
 */
function getAnalysisSchema(domain: AnalysisDomain) {
  switch (domain) {
    case "bookmarks":
      return bookmarkAiAnalysisResponseSchema;
    case "books":
      return bookAiAnalysisResponseSchema;
    case "projects":
      return projectAiAnalysisResponseSchema;
    default: {
      const unhandledDomain: never = domain;
      throw new Error(`Unhandled analysis domain: ${unhandledDomain}`);
    }
  }
}

// Request body schema imported from @/types/schemas/ai-analysis-persisted

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ domain: string; id: string }> },
): Promise<NextResponse> {
  preventCaching();

  const { domain, id } = await context.params;

  // Validate domain
  if (!VALID_DOMAINS.has(domain as AnalysisDomain)) {
    return createErrorResponse(`Invalid domain: ${domain}`, 400);
  }

  const validDomain = domain as AnalysisDomain;

  // Validate ID
  if (!id || id.length === 0 || id.length > 100) {
    return createErrorResponse("Invalid ID", 400);
  }

  // Rate limit by IP
  const clientIp = getClientIp(request.headers, { fallback: "anonymous" });
  if (clientIp === "anonymous") {
    envLogger.log(
      "Analysis persist: missing client IP",
      { domain, id },
      { category: "AiAnalysis" },
    );
  }
  const rateKey = `analysis-persist:${clientIp}`;

  if (!isOperationAllowed("ai-analysis-persist", rateKey, PERSIST_RATE_LIMIT)) {
    return buildApiRateLimitResponse({
      retryAfterSeconds: Math.ceil(PERSIST_RATE_LIMIT.windowMs / 1000),
      rateLimitScope: "ai-analysis-persist",
      rateLimitLimit: PERSIST_RATE_LIMIT.maxRequests,
      rateLimitWindowSeconds: Math.ceil(PERSIST_RATE_LIMIT.windowMs / 1000),
    });
  }

  // Parse request body
  let parsedBody: z.infer<typeof persistAnalysisRequestSchema>;
  try {
    const raw = (await request.json()) as unknown;
    parsedBody = persistAnalysisRequestSchema.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Analysis persist: invalid request body",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    return createErrorResponse(`Invalid request body: ${message}`, 400);
  }

  // Validate analysis data against domain-specific schema
  const analysisSchema = getAnalysisSchema(validDomain);
  const analysisResult = analysisSchema.safeParse(parsedBody.analysis);

  if (!analysisResult.success) {
    envLogger.log(
      "Analysis persist: invalid analysis data",
      { domain, id, error: analysisResult.error.message },
      { category: "AiAnalysis" },
    );
    return createErrorResponse("Invalid analysis data", 400);
  }

  // Persist to S3
  try {
    await persistAnalysis(validDomain, id, analysisResult.data, {
      modelVersion: parsedBody.modelVersion,
    });

    envLogger.log("Analysis persisted successfully", { domain, id }, { category: "AiAnalysis" });

    return NextResponse.json(
      { success: true, domain, id },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Analysis persist: S3 write failed",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    return createErrorResponse("Failed to persist analysis", 500);
  }
}
