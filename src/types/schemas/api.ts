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
