/**
 * Logger Module
 * @module lib/logger
 * @description
 * Provides a configurable logger that can be silenced during tests
 */

let isSilent = false;

export const logger = {
  warn: (...args: unknown[]) => {
    if (!isSilent) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (!isSilent) {
      console.error(...args);
    }
  },
  setSilent: (silent: boolean) => {
    isSilent = silent;
  },
};
