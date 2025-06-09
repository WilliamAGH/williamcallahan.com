/**
 * Simple Logger Utility
 *
 * Provides basic logging functionality with support for different log levels.
 * The log level is determined by the `DEBUG` and `VERBOSE` environment variables.
 *
 * @module utils/logger
 */

const isDebug = process.env.DEBUG === 'true' || process.env.VERBOSE === 'true';
const isVerbose = process.env.VERBOSE === 'true';

const logger = {
  /**
   * Logs a debug message. Only visible when `DEBUG` or `VERBOSE` is true.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  debug: (message: string, ...optionalParams: unknown[]): void => {
    if (isDebug) {
      console.log(`[DEBUG] ${message}`, ...optionalParams);
    }
  },

  /**
   * Logs an informational message. Visible unless in a very quiet mode.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  info: (message: string, ...optionalParams: unknown[]): void => {
    console.log(message, ...optionalParams);
  },

  /**
   * Logs a verbose informational message. Only visible when `VERBOSE` is true.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  verbose: (message: string, ...optionalParams: unknown[]): void => {
    if (isVerbose) {
      console.log(`[VERBOSE] ${message}`, ...optionalParams);
    }
  },

  /**
   * Logs a warning message. Always visible.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  warn: (message: string, ...optionalParams: unknown[]): void => {
    console.warn(`[WARN] ${message}`, ...optionalParams);
  },

  /**
   * Logs an error message. Always visible.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  error: (message: string, ...optionalParams: unknown[]): void => {
    console.error(`[ERROR] ${message}`, ...optionalParams);
  },
};

export default logger; 