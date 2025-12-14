/**
 * Type definitions for probe-image-size
 */
export interface ProbeResult {
  width: number;
  height: number;
  type: string;
  mime?: string;
  wUnits?: string;
  hUnits?: string;
  pages?: number;
  url?: string;
}

export interface ProbeOptions {
  timeout?: number;
  retries?: number;
}

declare module "probe-image-size" {
  function probe(input: string | Buffer | NodeJS.ReadableStream, options?: ProbeOptions): Promise<ProbeResult>;

  namespace probe {
    function sync(input: Buffer): ProbeResult | null;
  }

  export = probe;
}
