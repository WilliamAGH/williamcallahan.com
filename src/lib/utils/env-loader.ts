/**
 * Environment Variable Loader with Multi-line Support
 *
 * This module provides a custom environment variable loader that handles
 * multi-line values, particularly for private keys that break standard dotenv parsing.
 *
 * @module lib/utils/env-loader
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Loads environment variables from .env file with support for multi-line values.
 *
 * This is specifically designed to handle Google Service Account private keys
 * which contain newlines and can break standard dotenv parsing.
 *
 * The function:
 * - Reads the .env file manually
 * - Extracts GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY separately
 * - Parses remaining variables with dotenv
 * - Merges all variables into process.env
 */
export function loadEnvironmentWithMultilineSupport(): void {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const envFileContent = fs.readFileSync(envPath, { encoding: "utf-8" });
      const lines = envFileContent.split("\n");
      const cleanLines: string[] = [];
      let privateKeyVal = "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=")) {
          let value = trimmedLine.substring("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=".length);
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          privateKeyVal = value;
        } else {
          cleanLines.push(line);
        }
      }

      // Parse remaining lines manually
      for (const line of cleanLines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          if (key && !process.env[key]) {
            let processedValue = value || "";
            // Remove surrounding quotes if present
            if (
              (processedValue.startsWith('"') && processedValue.endsWith('"')) ||
              (processedValue.startsWith("'") && processedValue.endsWith("'"))
            ) {
              processedValue = processedValue.slice(1, -1);
            }
            process.env[key] = processedValue;
          }
        }
      }
      if (privateKeyVal && !process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY) {
        process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY = privateKeyVal;
      }
    }
  } catch (error) {
    console.error("Failed to load or parse .env file:", error);
  }
}
