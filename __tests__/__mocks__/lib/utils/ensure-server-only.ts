/**
 * Mock for ensure-server-only utilities.
 */
import { vi } from "vitest";
import type * as EnsureServerOnly from "@/lib/utils/ensure-server-only";

export const assertServerOnly = vi.fn<typeof EnsureServerOnly.assertServerOnly>(() => undefined);
