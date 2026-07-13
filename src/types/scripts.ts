export interface TestResult {
  name: string;
  endpoint: string;
  passed: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

export interface SmokeTestEndpointOptions {
  expectedStatus?: number;
  requiresAuth?: boolean;
  method?: string;
  body?: unknown;
  validateJson?: (data: unknown) => boolean;
  validateResponse?: (response: Response) => Promise<boolean>;
}
