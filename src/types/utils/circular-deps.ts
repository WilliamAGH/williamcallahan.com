/**
 * Types for the Circular Dependency Analysis Tool
 */

export interface ImportNode {
  file: string;
  imports: string[];
  exports: string[];
}

export interface CircularChain {
  chain: string[];
  description: string;
  severity: "high" | "medium" | "low";
  impactEstimate: number;
}
