"use client";

/**
 * Project AI Analysis Component
 * @module components/features/projects/project-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for project-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import { Code2 } from "lucide-react";
import type { ProjectAiAnalysisProps, ProjectAnalysisContext } from "@/types/project-ai-analysis";
import {
  projectAiAnalysisResponseSchema,
  type ProjectAiAnalysisResponse,
} from "@/types/schemas/project-ai-analysis";
import { extractProjectAnalysisContext } from "@/lib/projects/analysis/extract-context";
import {
  buildProjectAnalysisSystemPrompt,
  buildProjectAnalysisUserPrompt,
} from "@/lib/projects/analysis/build-prompt";
import { AiAnalysisTerminal } from "@/components/features/ai-analysis/ai-analysis-terminal.client";
import {
  BulletListSection,
  ChipListSection,
  TechDetailsSection,
} from "@/components/features/ai-analysis/analysis-render-sections";
import type { AnalysisRenderHelpers } from "@/types/ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "project-analysis";
const PERSISTENCE_KEY = "projects";

const LOADING_MESSAGES = [
  "Analyzing project architecture...",
  "Identifying key features...",
  "Evaluating tech stack...",
  "Synthesizing insights...",
];

export const PROJECT_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "project_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", minLength: 1 },
        category: { type: "string", minLength: 1 },
        keyFeatures: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        targetUsers: { type: "string", minLength: 1 },
        technicalDetails: {
          type: "object",
          additionalProperties: false,
          properties: {
            architecture: { type: ["string", "null"] },
            complexity: { type: ["string", "null"] },
            maturity: { type: ["string", "null"] },
          },
          required: ["architecture", "complexity", "maturity"],
        },
        relatedProjects: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        uniqueValue: { type: "string", minLength: 1 },
      },
      required: [
        "summary",
        "category",
        "keyFeatures",
        "targetUsers",
        "technicalDetails",
        "relatedProjects",
        "uniqueValue",
      ],
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderProjectAnalysis(
  analysis: ProjectAiAnalysisResponse,
  helpers: AnalysisRenderHelpers,
) {
  const { AnalysisSection, skipAnimation } = helpers;
  return (
    <>
      {analysis.summary && (
        <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
          {analysis.summary}
        </AnalysisSection>
      )}

      <BulletListSection
        items={analysis.keyFeatures}
        label="Key Features"
        index={1}
        accentColor="#9ece6a"
        helpers={helpers}
      />

      {analysis.targetUsers && (
        <AnalysisSection
          label="Target Users"
          index={2}
          accentColor="#e0af68"
          skipAnimation={skipAnimation}
        >
          {analysis.targetUsers}
        </AnalysisSection>
      )}

      <TechDetailsSection
        details={[
          { label: "architecture", value: analysis.technicalDetails?.architecture },
          { label: "complexity", value: analysis.technicalDetails?.complexity },
          { label: "maturity", value: analysis.technicalDetails?.maturity },
        ]}
        label="Technical Details"
        index={3}
        accentColor="#bb9af7"
        helpers={helpers}
      />

      {analysis.uniqueValue && (
        <AnalysisSection
          label="Unique Value"
          index={4}
          accentColor="#73daca"
          skipAnimation={skipAnimation}
        >
          {analysis.uniqueValue}
        </AnalysisSection>
      )}

      <ChipListSection
        items={analysis.relatedProjects}
        label="Related Projects"
        index={5}
        accentColor="#ff9e64"
        chipClassName="px-2 py-0.5 text-xs font-mono bg-[#ff9e64]/10 text-[#ff9e64] rounded border border-[#ff9e64]/20"
        helpers={helpers}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectAiAnalysis({
  project,
  className = "",
  autoTrigger = true,
  initialAnalysis,
  defaultCollapsed = false,
}: Readonly<ProjectAiAnalysisProps>) {
  // Use project.id if available, otherwise fall back to project.name
  const projectId = project.id ?? project.name;

  return (
    <AiAnalysisTerminal
      entity={project}
      entityId={projectId}
      featureName={AI_FEATURE_NAME}
      persistenceKey={PERSISTENCE_KEY}
      loadingMessages={LOADING_MESSAGES}
      extractContext={extractProjectAnalysisContext}
      buildSystemPrompt={buildProjectAnalysisSystemPrompt}
      buildUserPrompt={(ctx) => buildProjectAnalysisUserPrompt(ctx as ProjectAnalysisContext)}
      responseFormat={PROJECT_ANALYSIS_RESPONSE_FORMAT}
      responseSchema={projectAiAnalysisResponseSchema}
      renderAnalysis={renderProjectAnalysis}
      getCategory={(a) => a.category}
      footerIcon={<Code2 className="w-3 h-3" />}
      footerText="AI-powered insights"
      autoTrigger={autoTrigger}
      initialAnalysis={initialAnalysis}
      className={className}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
