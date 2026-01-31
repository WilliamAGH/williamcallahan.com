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
