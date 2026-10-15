/**
 * @file Manual mock for the @octokit/graphql package.
 */
import { vi } from "vitest";
import type * as OctokitGraphql from "@octokit/graphql";

export const graphql = vi.fn<typeof OctokitGraphql.graphql>();
export default { graphql };
