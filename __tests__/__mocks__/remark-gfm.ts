/**
 * @file Manual mock for the remark-gfm package.
 */
import { vi } from "vitest";

// The real plugin returns undefined and registers extensions on `this.data()`; this stub returns a no-op transformer.
export default vi.fn<() => () => void>(() => () => {});
