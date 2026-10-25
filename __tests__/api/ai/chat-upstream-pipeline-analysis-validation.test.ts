import {
  createPipeline,
  createValidatedContext,
  mockCallOpenAiCompatibleChatCompletions,
  resetPipelineMocks,
} from "./upstream-pipeline-test-harness";
import { ANALYSIS_SCHEMA_BY_FEATURE } from "@/app/api/ai/chat/[feature]/analysis-output-config";
import { buildChatPipeline } from "@/app/api/ai/chat/[feature]/upstream-pipeline";
import { BOOKMARK_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/bookmarks/bookmark-ai-analysis.client";
import { BOOK_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/books/book-ai-analysis.client";
import { PROJECT_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/projects/project-ai-analysis.client";
import { buildBookmarkAnalysisUserPrompt } from "@/lib/bookmarks/analysis/build-prompt";
import { buildBookAnalysisUserPrompt } from "@/lib/books/analysis/build-prompt";
import { buildProjectAnalysisUserPrompt } from "@/lib/projects/analysis/build-prompt";

const ANALYSIS_PROMPT = "Analyze this bookmark";
const VALID_TARGET_AUDIENCE = "Developers building browser automation agents";
const VALID_RELATED_RESOURCES = ["agent-browser", "Playwright"] as const;
const VALID_CONTEXTUAL_DETAILS = {
  primaryDomain: "Browser automation",
  format: "GitHub repository",
  accessMethod: "Open source",
} as const;
const bookmarkAnalysisSchema = ANALYSIS_SCHEMA_BY_FEATURE["bookmark-analysis"];

function parseBookmarkAnalysis(reply: string) {
  return bookmarkAnalysisSchema.parse(JSON.parse(reply));
}

type AnalysisPayload = {
  summary: string | string[];
  category: string;
  highlights: string[] | string;
  contextualDetails?: {
    primaryDomain?: string;
    format?: string;
    accessMethod?: string;
  };
  relatedResources: string[] | string;
  targetAudience: string | string[] | null;
};

function buildAnalysisJson(
  overrides: Partial<AnalysisPayload> = {},
  options?: { omitContextualDetails?: boolean },
): string {
  const includeContextualDetails = options?.omitContextualDetails !== true;
  const basePayload: AnalysisPayload = {
    summary: "z-agent-browser is a Rust-based browser automation CLI.",
    category: "Developer Tools",
    highlights: ["Stealth mode", "Playwright MCP integration"],
    relatedResources: [...VALID_RELATED_RESOURCES],
    targetAudience: VALID_TARGET_AUDIENCE,
    ...(includeContextualDetails ? { contextualDetails: { ...VALID_CONTEXTUAL_DETAILS } } : {}),
  };

  const payload: AnalysisPayload = {
    ...basePayload,
    ...overrides,
    ...(includeContextualDetails
      ? {
          contextualDetails: {
            ...VALID_CONTEXTUAL_DETAILS,
            ...overrides.contextualDetails,
          },
        }
      : {}),
  };

  return JSON.stringify(payload);
}

async function runBookmarkAnalysisPipeline(): Promise<string> {
  return createPipeline({
    feature: "bookmark-analysis",
    userContent: ANALYSIS_PROMPT,
  }).runUpstream();
}

describe("AI Chat Upstream Pipeline Analysis Validation", () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it.each([
    {
      feature: "bookmark-analysis" as const,
      responseFormat: BOOKMARK_ANALYSIS_RESPONSE_FORMAT,
      prompt: () =>
        buildBookmarkAnalysisUserPrompt({
          title: "Browser automation",
          url: "https://example.com",
          tags: [],
          description: null,
          author: null,
          publisher: null,
          existingSummary: null,
          note: null,
          contentExcerpt: null,
        }),
      response: () => buildAnalysisJson(),
      properties: {
        summary: { maxLength: 320 },
        category: { maxLength: 320 },
        targetAudience: { maxLength: 320 },
        highlights: { items: { maxLength: 180 } },
        relatedResources: { items: { maxLength: 180 } },
        contextualDetails: {
          properties: {
            primaryDomain: { maxLength: 140 },
            format: { maxLength: 140 },
            accessMethod: { maxLength: 140 },
          },
        },
      },
    },
    {
      feature: "book-analysis" as const,
      responseFormat: BOOK_ANALYSIS_RESPONSE_FORMAT,
      prompt: () =>
        buildBookAnalysisUserPrompt({
          title: "Practical software design",
          subtitle: null,
          authors: ["An Author"],
          description: null,
          genres: [],
          publisher: null,
          publishedYear: null,
          narrators: [],
          existingSummary: null,
          thoughts: null,
        }),
      response: () =>
        JSON.stringify({
          summary: "A guide to practical software design.",
          category: "Technical Reference",
          keyThemes: ["Maintainability"],
          idealReader: "Software engineers",
          contextualDetails: { writingStyle: null, readingLevel: null, commitment: null },
          relatedReading: ["Refactoring"],
          whyItMatters: "Helps engineers maintain software.",
        }),
      properties: {
        summary: { maxLength: 320 },
        category: { maxLength: 320 },
        idealReader: { maxLength: 320 },
        whyItMatters: { maxLength: 320 },
        keyThemes: { items: { maxLength: 180 } },
        relatedReading: { items: { maxLength: 180 } },
        contextualDetails: {
          properties: {
            writingStyle: { maxLength: 140 },
            readingLevel: { maxLength: 140 },
            commitment: { maxLength: 140 },
          },
        },
      },
    },
    {
      feature: "project-analysis" as const,
      responseFormat: PROJECT_ANALYSIS_RESPONSE_FORMAT,
      prompt: () =>
        buildProjectAnalysisUserPrompt({
          name: "Browser automation",
          shortSummary: "Automates browser tasks.",
          description: "A browser automation CLI.",
          url: "https://example.com",
          githubUrl: null,
          techStack: [],
          tags: [],
          note: null,
        }),
      response: () =>
        JSON.stringify({
          summary: "A browser automation CLI.",
          category: "Developer Tool",
          keyFeatures: ["Browser automation"],
          targetUsers: "Software engineers",
          technicalDetails: { architecture: null, complexity: null, maturity: null },
          relatedProjects: ["Playwright"],
          uniqueValue: "Automates repetitive browser tasks.",
        }),
      properties: {
        summary: { maxLength: 320 },
        category: { maxLength: 320 },
        targetUsers: { maxLength: 320 },
        uniqueValue: { maxLength: 320 },
        keyFeatures: { items: { maxLength: 180 } },
        relatedProjects: { items: { maxLength: 180 } },
        technicalDetails: {
          properties: {
            architecture: { maxLength: 140 },
            complexity: { maxLength: 140 },
            maturity: { maxLength: 140 },
          },
        },
      },
    },
  ])(
    "communicates every length budget before generating $feature",
    async ({ feature, responseFormat, prompt, response, properties }) => {
      const userPrompt = prompt();
      expect(userPrompt).toContain("top-level string within 320 characters");
      expect(userPrompt).toContain("list item within 180 characters");
      expect(userPrompt).toContain(
        "contextualDetails or technicalDetails string within 140 characters",
      );
      const ctx = createValidatedContext({ responseFormat });
      mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: response() } }],
      });
      const reply = await buildChatPipeline({
        feature,
        ctx: { ...ctx, feature, parsedBody: { ...ctx.parsedBody, userText: userPrompt } },
        ragResult: { augmentedPrompt: undefined, status: "not_applicable" },
        signal: new AbortController().signal,
      }).runUpstream();
      expect(ANALYSIS_SCHEMA_BY_FEATURE[feature].safeParse(JSON.parse(reply)).success).toBe(true);
      expect(
        mockCallOpenAiCompatibleChatCompletions.mock.calls[0]?.[0].request.response_format,
      ).toMatchObject({
        type: "json_schema",
        json_schema: { strict: true, schema: { properties } },
      });
    },
  );

  it("accepts returned output at each existing character budget without repair", async () => {
    const analysis = buildAnalysisJson({
      summary: "s".repeat(320),
      highlights: ["h".repeat(180)],
      contextualDetails: { primaryDomain: "d".repeat(140) },
    });
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: analysis } }],
    });
    const reply = await runBookmarkAnalysisPipeline();
    expect(parseBookmarkAnalysis(reply)).toEqual(parseBookmarkAnalysis(analysis));
    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
  });

  it("retries invalid bookmark-analysis JSON and returns schema-valid output", async () => {
    const invalidAnalysis = '{"summary":"Only summary"}';
    const validAnalysis = buildAnalysisJson();

    mockCallOpenAiCompatibleChatCompletions
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: invalidAnalysis } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: validAnalysis } }],
      });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.summary.length).toBeGreaterThan(0);
    expect(parsed.category.length).toBeGreaterThan(0);
    expect(parsed.highlights.length).toBeGreaterThan(0);
    expect(parsed.targetAudience.length).toBeGreaterThan(0);
  });

  it.each([
    {
      label: "repairs an over-budget top-level string",
      invalidAnalysis: buildAnalysisJson({ summary: "s".repeat(321) }),
      expectedResources: [...VALID_RELATED_RESOURCES],
      expectedAudience: VALID_TARGET_AUDIENCE,
    },
    {
      label: "repairs an over-budget list item",
      invalidAnalysis: buildAnalysisJson({ highlights: ["h".repeat(181)] }),
      expectedResources: [...VALID_RELATED_RESOURCES],
      expectedAudience: VALID_TARGET_AUDIENCE,
    },
    {
      label: "repairs an over-budget detail string",
      invalidAnalysis: buildAnalysisJson({ contextualDetails: { primaryDomain: "d".repeat(141) } }),
      expectedResources: [...VALID_RELATED_RESOURCES],
      expectedAudience: VALID_TARGET_AUDIENCE,
    },
    {
      label: "retries semantically invalid bookmark-analysis content and normalizes output",
      invalidAnalysis: buildAnalysisJson({
        summary: "z-agent-browser is a Rust automation CLI.",
        highlights: ["Stealth mode"],
        relatedResources: ["///<<<>>>..."],
        targetAudience: "   ",
      }),
      expectedResources: [...VALID_RELATED_RESOURCES],
      expectedAudience: VALID_TARGET_AUDIENCE,
    },
    {
      label: "rejects prompt-leakage text in analysis fields and retries",
      invalidAnalysis: buildAnalysisJson({
        highlights: ["Stealth mode"],
        contextualDetails: {
          primaryDomain: "Rust",
          format: "GitHub repository",
          accessMethod: "Repository",
        },
        relatedResources: ["agent-browser"],
        targetAudience:
          'The user wants strict JSON. Provide strict JSON. ```json {"placeholder":true} ```',
      }),
      expectedResources: ["agent-browser", "Playwright"],
      expectedAudience: VALID_TARGET_AUDIENCE,
    },
  ])("$label", async ({ invalidAnalysis, expectedResources, expectedAudience }) => {
    const validAnalysis = buildAnalysisJson();

    mockCallOpenAiCompatibleChatCompletions
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: invalidAnalysis } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: validAnalysis } }],
      });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.targetAudience).toBe(expectedAudience);
    expect(parsed.relatedResources).toEqual(expectedResources);
    const repairPrompt =
      mockCallOpenAiCompatibleChatCompletions.mock.calls[1]?.[0].request.messages.at(-1)?.content;
    expect(repairPrompt).toContain("top-level string within 320 characters");
    expect(repairPrompt).toContain("list item within 180 characters");
    expect(repairPrompt).toContain(
      "contextualDetails or technicalDetails string within 140 characters",
    );
  });

  it("normalizes coercible analysis field shapes before validation", async () => {
    const coercibleAnalysis = buildAnalysisJson({
      summary: ["z-agent-browser is a Rust-based browser automation CLI."],
      highlights: "Stealth mode",
      relatedResources: "agent-browser",
      targetAudience: [VALID_TARGET_AUDIENCE],
    });

    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: coercibleAnalysis } }],
    });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.summary).toBe("z-agent-browser is a Rust-based browser automation CLI.");
    expect(parsed.highlights).toEqual(["Stealth mode"]);
    expect(parsed.relatedResources).toEqual(["agent-browser"]);
    expect(parsed.targetAudience).toBe(VALID_TARGET_AUDIENCE);
  });

  it("strips LLM control tokens from list fields before validation", async () => {
    const controlTokenAnalysis = buildAnalysisJson({
      highlights: ["<|assistant|>", "Stealth mode"],
      relatedResources: ["<|assistant|>agent-browser", "Playwright"],
    });

    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: controlTokenAnalysis } }],
    });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.highlights).toEqual(["Stealth mode"]);
    expect(parsed.relatedResources).toEqual(["agent-browser", "Playwright"]);
  });

  it.each([
    { label: "from punctuation-only values", targetAudience: "..." },
    { label: "when field is null", targetAudience: null },
    { label: "when field is an array of symbols", targetAudience: ["---", "***"] },
  ])("derives targetAudience fallback $label", async ({ targetAudience }) => {
    const analysis = buildAnalysisJson({ targetAudience });

    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: analysis } }],
    });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.targetAudience).toBe("People interested in Developer Tools.");
  });

  it("fills missing contextualDetails fields with null instead of failing", async () => {
    const missingDetailsAnalysis = buildAnalysisJson(
      {
        summary: "z-agent-browser is a Rust-based browser automation CLI.",
        category: "Developer Tools",
        highlights: ["Stealth mode", "Playwright MCP integration"],
        relatedResources: ["agent-browser", "Playwright"],
        targetAudience: VALID_TARGET_AUDIENCE,
      },
      { omitContextualDetails: true },
    );

    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: missingDetailsAnalysis } }],
    });

    const reply = await runBookmarkAnalysisPipeline();
    const parsed = parseBookmarkAnalysis(reply);
    expect(parsed.contextualDetails).toEqual({
      primaryDomain: null,
      format: null,
      accessMethod: null,
    });
  });
});
