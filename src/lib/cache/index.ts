/**
 * @fileoverview Main entrypoint for caching utilities.
 * This file re-exports all functionalities from the base cache module,
 * providing a single, consistent import path for other parts of the application.
 * @version 1.0.0
 */

/**
 * Re-exports all functionalities from the core cache utility file.
 */
export * from "../cache";

/**
 * Re-exports cache invalidation utilities for GitHub activity.
 */
export * from "./invalidation";
