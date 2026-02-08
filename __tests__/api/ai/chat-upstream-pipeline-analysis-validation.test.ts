import {
  createPipeline,
  mockCallOpenAiCompatibleChatCompletions,
  resetPipelineMocks,
} from "./upstream-pipeline-test-harness";

const ANALYSIS_PROMPT = "Analyze this bookmark";
const VALID_TARGET_AUDIENCE = "Developers building browser automation agents";
const VALID_RELATED_RESOURCES = ["agent-browser", "Playwright"] as const;
const VALID_CONTEXTUAL_DETAILS = {
  primaryDomain: "Browser automation",
  format: "GitHub repository",
  accessMethod: "Open source",
} as const;

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

    const parsed = JSON.parse(reply) as {
      summary: string;
      category: string;
      highlights: string[];
      targetAudience: string;
    };
    expect(parsed.summary.length).toBeGreaterThan(0);
    expect(parsed.category.length).toBeGreaterThan(0);
    expect(parsed.highlights.length).toBeGreaterThan(0);
    expect(parsed.targetAudience.length).toBeGreaterThan(0);
  });

  it.each([
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

    const parsed = JSON.parse(reply) as { targetAudience: string; relatedResources: string[] };
    expect(parsed.targetAudience).toBe(expectedAudience);
    expect(parsed.relatedResources).toEqual(expectedResources);
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

    const parsed = JSON.parse(reply) as {
      summary: string;
      highlights: string[];
      relatedResources: string[];
      targetAudience: string;
    };
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

    const parsed = JSON.parse(reply) as { highlights: string[]; relatedResources: string[] };
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

    const parsed = JSON.parse(reply) as { targetAudience: string };
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

    const parsed = JSON.parse(reply) as {
      contextualDetails: {
        primaryDomain: string | null;
        format: string | null;
        accessMethod: string | null;
      };
    };
    expect(parsed.contextualDetails).toEqual({
      primaryDomain: null,
      format: null,
      accessMethod: null,
    });
  });
});
