export interface TestResult {
  name: string;
  endpoint: string;
  passed: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}