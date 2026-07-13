export interface TestResult {
  name: string;
  endpoint: string;
  passed: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

interface SmokeTestEndpointBaseOptions {
  expectedStatus?: number;
  requiresAuth?: boolean;
  headers?: HeadersInit;
  method?: string;
  body?: unknown;
}

export type SmokeTestEndpointOptions = SmokeTestEndpointBaseOptions &
  (
    | { validateJson: (data: unknown) => boolean; validateResponse?: never }
    | { validateJson?: never; validateResponse: (response: Response) => Promise<boolean> }
    | { validateJson?: never; validateResponse?: never }
  );
