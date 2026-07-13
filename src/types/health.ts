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
