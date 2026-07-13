import { z } from "zod/v4";

export const productionRefreshResponseSchema = z.object({
  status: z.string().optional(), // 'success' or 'error'
  message: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(), // For success payload
  error: z.string().optional(), // For error payload
});

export type ProductionRefreshResponse = z.infer<typeof productionRefreshResponseSchema>;

/**
 * Schema for Cloudflare cf-visitor header JSON
 * Contains visitor connection info like protocol scheme
 */
export const cfVisitorSchema = z.object({
  scheme: z.string().optional(),
});

export type CfVisitor = z.infer<typeof cfVisitorSchema>;

export const standardApiErrorCodeSchema = z.enum(["RATE_LIMITED", "SERVICE_UNAVAILABLE"]);

export const standardApiErrorResponseSchema = z.object({
  code: standardApiErrorCodeSchema,
  message: z.string().min(1),
  retryAfterSeconds: z.number().int().positive(),
  retryAfterAt: z.string().datetime({ offset: true }),
  status: z.union([z.literal(429), z.literal(503)]),
});

export type StandardApiErrorCode = z.infer<typeof standardApiErrorCodeSchema>;
export type StandardApiErrorResponse = z.infer<typeof standardApiErrorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("healthy"),
  timestamp: z.iso.datetime(),
});

export const bookmarkDiagnosticsResponseSchema = z.object({
  status: z.enum(["ok", "fail"]),
  environment: z.object({
    NODE_ENV: z.string().optional(),
    resolved: z.enum(["development", "production", "test"]),
    suffix: z.string(),
    siteUrl: z.string().nullable(),
    apiBaseUrl: z.string().nullable(),
  }),
  storage: z.object({
    backend: z.literal("postgres"),
    indexExists: z.boolean(),
    bookmarkCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    lastFetchedAt: z.number().int().nullable(),
    lastModified: z.string().nullable(),
    checksum: z.string().nullable(),
  }),
  checks: z.object({
    indexOk: z.boolean(),
    firstPageOk: z.boolean(),
    tagStateOk: z.boolean(),
    slugMapOk: z.boolean(),
  }),
  details: z.object({
    firstPageCount: z.number().int().nonnegative(),
    tagSlugCount: z.number().int().nonnegative(),
    sampleTagSlugs: z.array(z.string()),
    slugMappingCount: z.number().int().nonnegative(),
    slugMappingGeneratedAt: z.string().nullable(),
  }),
});
