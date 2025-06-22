/**
 * Environment Variable Loader with Multi-line Support
 *
 * This module provides a custom environment variable loader that handles
 * multi-line values, particularly for private keys that break standard dotenv parsing.
 *
 * @module lib/utils/env-loader
 */

import * as dotenv from "dotenv";
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

      const envConfig = dotenv.parse(cleanLines.join("\n"));
      for (const k in envConfig) {
        if (!Object.hasOwn(process.env, k)) {
          process.env[k] = envConfig[k];
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