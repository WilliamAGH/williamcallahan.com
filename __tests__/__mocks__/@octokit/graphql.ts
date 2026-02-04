/**
 * @file Manual mock for the @octokit/graphql package.
 */
import { vi } from "vitest";

export const graphql = vi.fn();
export default { graphql };
