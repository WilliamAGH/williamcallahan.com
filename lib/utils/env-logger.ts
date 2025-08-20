/**
 * Environment-aware logging utility
 * 
 * Provides condensed logging in production and verbose logging in development.
 * Uses DEPLOYMENT_ENV to determine the current environment.
 */

import { getEnvironment } from "@/lib/config/environment";
import type { Environment } from "@/types/config";
import type { LogOptions } from "@/types/logging";

// String truncation configuration
const STRING_TRUNCATE_LENGTH = 50;
const TITLE_PREVIEW_LENGTH = 30;
const ELLIPSIS = "...";

class EnvLogger {
  private readonly isDevelopment: boolean;
  private readonly environment: Environment;

  constructor() {
    this.environment = getEnvironment();
    this.isDevelopment = this.environment === "development";
  }

  /**
   * Log a message with environment-aware formatting
   * In production: Single line with essential info
   * In development: Detailed multi-line output
   */
  log(message: string, data?: unknown, options: LogOptions = {}): void {
    const { forceVerbose = false, context = {}, category } = options;
    const prefix = category ? `[${category}]` : "";
    const shouldBeVerbose = this.isDevelopment || forceVerbose;

    if (shouldBeVerbose && data !== undefined) {
      // Development mode: Verbose logging
      console.log(`${prefix} ${message}`);
      if (typeof data === "object" && data !== null) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(data);
      }
    } else {
      // Production mode: Condensed single-line logging
      const condensedData = this.condenseData(data);
      const contextStr = Object.keys(context).length > 0 
        ? ` | ${JSON.stringify(context)}` 
        : "";
      
      if (condensedData) {
        console.log(`${prefix} ${message}: ${condensedData}${contextStr}`);
      } else {
        console.log(`${prefix} ${message}${contextStr}`);
      }
    }
  }

  /**
   * Log verbose details only in development
   * Completely silent in production unless forceVerbose is true
   */
  debug(message: string, data?: unknown, options: LogOptions = {}): void {
    const { forceVerbose = false, category } = options;
    
    if (this.isDevelopment || forceVerbose) {
      const prefix = category ? `[${category}]` : "";
      console.log(`${prefix} ${message}`);
      if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Log a group of related messages
   * In development: Shows all messages with separators
   * In production: Shows only the summary
   */
  group(summary: string, details: Array<{ message: string; data?: unknown }>, options: LogOptions = {}): void {
    const { category } = options;
    const prefix = category ? `[${category}]` : "";

    if (this.isDevelopment) {
      console.log(`${prefix} ========== ${summary.toUpperCase()} ==========`);
      details.forEach(({ message, data }) => {
        console.log(`${prefix} ${message}`);
        if (data !== undefined) {
          console.log(JSON.stringify(data, null, 2));
        }
      });
      console.log(`${prefix} ${"=".repeat(summary.length + 22)}`);
    } else {
      // In production, just log a summary
      const detailCount = details.length;
      const dataPoints = details
        .filter(d => d.data !== undefined)
        .map(d => this.condenseData(d.data))
        .filter(Boolean)
        .slice(0, 2); // Only show first 2 data points in production
      
      const dataStr = dataPoints.length > 0 ? `: ${dataPoints.join(", ")}` : "";
      console.log(`${prefix} ${summary} (${detailCount} items)${dataStr}`);
    }
  }

  /**
   * Log structured data (like service calls)
   * In development: Multi-line with indentation
   * In production: Single line with key info
   */
  service(
    serviceName: string,
    method: string,
    data?: Record<string, unknown>,
    result?: unknown
  ): void {
    if (this.isDevelopment) {
      console.log(`[${serviceName}] ${method} called${data ? " with options:" : ""}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
      if (result !== undefined) {
        console.log(`[${serviceName}] ${method} result:`, result);
      }
    } else {
      // Production: Condensed format
      const dataStr = data ? ` (${Object.keys(data).length} params)` : "";
      const resultStr = this.getResultSummary(result);
      console.log(`[${serviceName}] ${method}${dataStr}${resultStr ? ` → ${resultStr}` : ""}`);
    }
  }

  /**
   * Special method for analytics/pageview logs that should remain detailed
   */
  analytics(data: Record<string, unknown>): void {
    // Analytics logs should always be detailed for monitoring
    console.log(JSON.stringify({ 
      timestamp: new Date().toISOString(),
      type: "server_pageview",
      data 
    }));
  }

  /**
   * Condense data for production logging
   */
  private condenseData(data: unknown): string {
    if (data === undefined || data === null) {
      return "";
    }

    if (typeof data === "string") {
      return data.length > STRING_TRUNCATE_LENGTH
        ? `${data.substring(0, STRING_TRUNCATE_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`
        : data;
    }

    if (typeof data === "number" || typeof data === "boolean") {
      return String(data);
    }

    if (Array.isArray(data)) {
      return `[${data.length} items]`;
    }

    if (typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const keys = Object.keys(obj);
      
      // Special handling for common patterns
      if ("id" in obj && "title" in obj) {
        const rawTitle = obj.title;
        const titleValue = rawTitle == null ? "" : 
                          typeof rawTitle === "string" ? rawTitle :
                          typeof rawTitle === "number" || typeof rawTitle === "boolean" ? String(rawTitle) :
                          JSON.stringify(rawTitle);
        const title = titleValue.substring(0, TITLE_PREVIEW_LENGTH);
        return `id=${String(obj.id)}, title="${title}${titleValue.length > TITLE_PREVIEW_LENGTH ? ELLIPSIS : ""}"`;
      }
      
      if ("length" in obj) {
        return `length=${String(obj.length)}`;
      }

      return `{${keys.length} props}`;
    }

    // At this point, data could be null, undefined, or other primitive
    if (data == null) {
      return String(data);
    }
    
    // For any remaining types (symbols, functions, etc.)
    return typeof data === "string" ? data : JSON.stringify(data);
  }

  /**
   * Get a summary of a result value
   */
  private getResultSummary(result: unknown): string {
    if (result === undefined || result === null) {
      return "";
    }

    if (Array.isArray(result)) {
      return `${result.length} items`;
    }

    if (typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if ("length" in obj) {
        return `${String(obj.length)} items`;
      }
      if ("count" in obj) {
        return `count=${String(obj.count)}`;
      }
      return "success";
    }

    return this.condenseData(result);
  }
}

// Export singleton instance
export const envLogger = new EnvLogger();

// Export convenience methods
export const logDev = envLogger.debug.bind(envLogger);
export const logProd = envLogger.log.bind(envLogger);
export const logService = envLogger.service.bind(envLogger);
export const logGroup = envLogger.group.bind(envLogger);
export const logAnalytics = envLogger.analytics.bind(envLogger);