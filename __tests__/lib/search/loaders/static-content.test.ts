/**
 * Tests for Static Content Loaders
 *
 * Per [TST1d]: the static indexes are built from data that ships with the
 * deploy, so each one must load once per process rather than on every search.
 *
 * @module __tests__/lib/search/loaders/static-content
 */

import { getEducationIndex, getExperienceIndex } from "@/lib/search/loaders/static-content";

describe("Static Content Loaders", () => {
  it.each([
    ["experience", getExperienceIndex],
    ["education", getEducationIndex],
  ])("returns the same %s index instead of rebuilding it per call", async (_name, getIndex) => {
    // Without memoization every call re-read the serialized artifact or rebuilt
    // the MiniSearch index, so each call produced a distinct instance.
    const [first, second] = await Promise.all([getIndex(), getIndex()]);

    expect(second).toBe(first);
    await expect(getIndex()).resolves.toBe(first);
  });
});
