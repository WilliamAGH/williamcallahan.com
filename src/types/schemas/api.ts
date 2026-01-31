import { z } from "zod";

export const productionRefreshResponseSchema = z.object({
  status: z.string().optional(), // 'success' or 'error'
  message: z.string().optional(),
  data: z.record(z.any()).optional(), // For success payload
  error: z.string().optional(), // For error payload
});

export type ProductionRefreshResponse = z.infer<typeof productionRefreshResponseSchema>;
