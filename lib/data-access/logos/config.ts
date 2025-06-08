/**
 * Configuration for the Logos Data Access Module
 *
 * @module data-access/logos/config
 */

// --- Configuration & Constants ---
export const LOGOS_S3_KEY_DIR = 'images/logos';

export const VERBOSE = process.env.VERBOSE === 'true' || false;

// Session-based tracking to prevent infinite loops
export const SESSION_MAX_DURATION = 30 * 60 * 1000; // 30 minutes
export const MAX_RETRIES_PER_SESSION = 2;
