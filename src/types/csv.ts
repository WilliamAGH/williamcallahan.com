/**
 * CSV Type Definitions
 */

export interface CSVParseOptions {
  delimiter?: string;
  skipEmpty?: boolean;
  maxRows?: number;
  headers?: boolean;
}

export interface CSVLine {
  [key: string]: string | number;
}
