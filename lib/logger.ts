/**
 * Logger Module
 * @module lib/logger
 * @description
 * Provides a configurable logger that can be silenced during tests
 */

let isSilent = false;

export const logger = {
  warn: (...args: any[]) => {
    if (!isSilent) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (!isSilent) {
      console.error(...args);
    }
  },
  setSilent: (silent: boolean) => {
    isSilent = silent;
  }
};
