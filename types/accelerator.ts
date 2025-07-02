/**
 * Accelerator Types * @module types/accelerator
 * @description
 * Type definitions for accelerator programs.
 * These types are derived from Zod schemas for runtime validation.
 * @see @link {types/schema/accelerator.ts}
 */

// Re-export type from the schema file for single source of truth
export type { Accelerator } from "./schemas/accelerator";

// Re-export validation function for convenience
export { validateAccelerator } from "./schemas/accelerator";
