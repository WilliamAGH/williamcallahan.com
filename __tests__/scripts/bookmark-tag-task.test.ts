// @vitest-environment node
import { runBookmarkTagTask } from "../../scheduler/lib/bookmark-tag-task";

it("reports the actual tag child failure without replacing it with an exit code alone", async () => {
  // Argument validation fails before database setup or any ingestion write.
  const result = await runBookmarkTagTask("bookmark-tags", ["--repair-cycles"]);
  expect(result.success).toBe(false);
  expect(result.operation).toBe("bookmark-tags");
  expect(result.error).toContain("Tag ingestion exited with code 1");
  expect(result.error).toContain(
    "Use --repair-cycles=canonical-slug[,canonical-slug...] to bound the repair.",
  );
});
