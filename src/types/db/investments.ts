/** Row shape for investment embedding backfill queries. */
export interface InvestmentEmbeddingSelect {
  id: string;
  name: string;
  description: string;
  category: string | null;
  stage: string;
  status: string;
  operatingStatus: string;
  location: string | null;
  type: string;
  investedYear: string;
  accelerator: unknown;
}

export interface InvestmentEmbeddingBackfillOptions {
  batchSize?: number;
  maxRows?: number;
  dryRun?: boolean;
}

export interface InvestmentEmbeddingBackfillResult {
  processedRows: number;
  updatedRows: number;
  remainingRows: number;
  usedModel: string;
  dryRun: boolean;
}
