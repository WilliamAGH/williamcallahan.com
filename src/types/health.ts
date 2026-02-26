import { z } from "zod/v4";

export interface DeepCheckResult {
  name: string;
  status: "ok" | "error";
  details: string;
  duration: number;
}

export interface DeploymentReadinessCheckResult {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  severity: "critical" | "warning" | "info";
  details?: string[];
}

// =============================================================================
// Health endpoint types and schema
// =============================================================================

// Schema matching the /api/health/metrics endpoint response
export const HealthMetricsResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  // System details may vary by environment; keep them flexible
  system: z.record(z.string(), z.unknown()),
});

export type HealthMetrics = z.infer<typeof HealthMetricsResponseSchema>;
