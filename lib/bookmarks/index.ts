/**
 * @fileoverview Aggregates and exports all bookmark-related functionalities.
 * This module serves as the single entry point for accessing both shared and server-specific
 * bookmark utilities from other parts of the application.
 * @version 1.0.0
 */

/**
 * Exports all shared bookmark functionalities from `lib/bookmarks.ts`.
 * @see {@link ../bookmarks.ts}
 */
export * from "../bookmarks";

/**
 * Exports all server-specific bookmark functionalities from `lib/bookmarks.server.ts`.
 * @see {@link ../bookmarks.server.ts}
 */
export * from "../bookmarks.server";
