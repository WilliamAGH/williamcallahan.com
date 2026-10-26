/** @vitest-environment node */
import {
  buildGraduatedBookmarkDescription,
  buildGraduatedBookmarkTitle,
  buildGraduatedTagHubDescription,
  countWords,
  evaluateBookmarkIndexability,
  evaluateTagHubIndexability,
} from "@/lib/seo/bookmark-seo-policy";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";

// Exactly 100 characters and 15 words: each independent gate can fail on its own.
const THRESHOLD_NOTE =
  "We study this guide to compare agent workflows and verify changes before shipping reliable software.";
const SUMMARY =
  "The resource explains repository instructions, review checkpoints, and repeatable checks that help maintainers compare tools without losing the context needed to make an informed decision.";

describe("bookmark SEO graduation", () => {
  it.each([
    { text: "", expected: 0 },
    { text: "   ", expected: 0 },
    { text: "\t\n", expected: 0 },
    { text: "one", expected: 1 },
    { text: "  one\t two\nthree  ", expected: 3 },
  ])("counts words without counting whitespace: $text", ({ text, expected }) => {
    expect(countWords(text)).toBe(expected);
  });

  it.each([undefined, null, "", "   \n "])(
    "rejects a missing practitioner note (%j), regardless of captured text length",
    (note) => {
      const result = evaluateBookmarkIndexability({
        note,
        summary: SUMMARY.repeat(3),
        description: SUMMARY.repeat(3),
      });

      expect(result).toMatchObject({
        indexable: false,
        noteChars: 0,
        noteWords: 0,
        robots: { index: false, follow: true },
      });
    },
  );

  it.each([
    ["a label", "peon-ping"],
    ["fewer than 100 trimmed characters", `  ${THRESHOLD_NOTE.slice(0, -1)}  `],
    ["fewer than 15 words", THRESHOLD_NOTE.replace("We study", "Studying")],
  ])("rejects a note with %s despite a substantial summary", (_reason, note) => {
    expect(evaluateBookmarkIndexability({ note, summary: SUMMARY })).toMatchObject({
      indexable: false,
      robots: { index: false, follow: true },
    });
  });

  it("rejects a substantive annotation when the source is unavailable", () => {
    expect(
      evaluateBookmarkIndexability({
        note: THRESHOLD_NOTE,
        summary: SUMMARY,
        sourceUnavailable: true,
      }),
    ).toMatchObject({ indexable: false, robots: { index: false, follow: true } });
  });

  it.each([
    { note: THRESHOLD_NOTE, chars: 100, words: 15 },
    { note: `${THRESHOLD_NOTE}${" context".repeat(18)} note`, chars: 249, words: 34 },
  ])("rejects a qualifying note with only $chars combined characters", ({ note, chars, words }) => {
    expect(evaluateBookmarkIndexability({ note })).toMatchObject({
      indexable: false,
      noteChars: chars,
      noteWords: words,
      combinedChars: chars,
      robots: { index: false, follow: true },
    });
  });

  it.each([{ archived: true }, { isPrivate: true }, { isCanonicalSlug: false }])(
    "rejects an otherwise qualifying bookmark with excluded eligibility: %j",
    (eligibility) => {
      expect(
        evaluateBookmarkIndexability({
          note: THRESHOLD_NOTE,
          summary: SUMMARY,
          ...eligibility,
        }),
      ).toMatchObject({ indexable: false, robots: { index: false, follow: true } });
    },
  );

  it("collapses internal summary whitespace before measuring the combined threshold", () => {
    const RAW_SUMMARY_CHARS = 149;
    const summary = SUMMARY.slice(0, RAW_SUMMARY_CHARS - 1).replace(" ", "\n\n");

    expect(summary).toHaveLength(RAW_SUMMARY_CHARS);
    expect(evaluateBookmarkIndexability({ note: THRESHOLD_NOTE, summary })).toMatchObject({
      combinedChars: 249,
      indexable: false,
      robots: { index: false, follow: true },
    });
  });

  it.each(["summary", "description"] as const)(
    "graduates a trimmed threshold annotation supported by %s",
    (field) => {
      const result = evaluateBookmarkIndexability({
        note: `  ${THRESHOLD_NOTE}\n`,
        [field]: SUMMARY,
        sourceUnavailable: false,
      });

      expect(result).toMatchObject({
        indexable: true,
        noteChars: 100,
        noteWords: 15,
        robots: { index: true, follow: true },
      });
      expect(result.combinedChars).toBeGreaterThanOrEqual(250);
    },
  );

  it("graduates at exactly 250 combined characters without requiring captured text", () => {
    const note = `${THRESHOLD_NOTE}${" context".repeat(18)} notes`;

    expect(evaluateBookmarkIndexability({ note })).toMatchObject({
      indexable: true,
      noteChars: 250,
      combinedChars: 250,
      robots: { index: true, follow: true },
    });
  });
});

describe("tag hub SEO graduation", () => {
  it.each([12, 150])("graduates canonical page one with %i resources", (totalCount) => {
    expect(evaluateTagHubIndexability({ totalCount, pageNumber: 1 })).toEqual({
      indexable: true,
      robots: { index: true, follow: true },
    });
  });

  it.each([
    { totalCount: 150, pageNumber: 2 },
    { totalCount: 11, pageNumber: 1 },
    { totalCount: 50, pageNumber: 1, isAlias: true },
  ])("keeps excluded hub requests crawlable: %j", (input) => {
    expect(evaluateTagHubIndexability(input)).toEqual({
      indexable: false,
      robots: { index: false, follow: true },
    });
  });
});

describe("graduated metadata copy", () => {
  it.each([undefined, "example.com"])("labels bookmark titles as Field Notes (%j)", (domain) => {
    const title = buildGraduatedBookmarkTitle("Agent workflow comparison", domain);

    expect(title).toContain("Agent workflow comparison");
    expect(title).toContain("Field Notes");
  });

  it("preserves Field Notes suffix through generateDynamicTitle even for long upstream titles", () => {
    const longTitle =
      "AGENTS.md - the new standard filename across LLM code tooling and autonomous agents";
    const graduatedTitle = buildGraduatedBookmarkTitle(longTitle, "agents.md");
    const finalTitle = generateDynamicTitle(graduatedTitle, "bookmarks");

    expect(graduatedTitle.length).toBeLessThanOrEqual(70);
    expect(finalTitle).toContain("Field Notes");
  });

  it("leads with the practitioner annotation rather than captured summary or boilerplate", () => {
    const description = buildGraduatedBookmarkDescription({
      note: `  ${THRESHOLD_NOTE}  `,
      summary: SUMMARY,
      description: "Captured publisher description",
      domainName: "example.com",
    });

    expect(description.startsWith(THRESHOLD_NOTE)).toBe(true);
    expect(description).not.toContain("A bookmark from");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("bounds a long practitioner annotation without replacing its leading insight", () => {
    const description = buildGraduatedBookmarkDescription({
      note: `${THRESHOLD_NOTE} ${SUMMARY}`,
      domainName: "example.com",
    });

    expect(description.startsWith(THRESHOLD_NOTE)).toBe(true);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("describes a topic hub using its resources, annotations, and leading domains", () => {
    const description = buildGraduatedTagHubDescription({
      displayTag: "Agent workflows",
      totalCount: 24,
      annotatedCount: 7,
      topDomains: ["example.com", "docs.example.org"],
    });

    expect(description).toContain("Agent workflows");
    expect(description).toContain("24");
    expect(description).toMatch(/7\s+[^.]*notes?/i);
    expect(description).toContain("example.com");
    expect(description).toContain("docs.example.org");
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
