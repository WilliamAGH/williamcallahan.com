"use client";

/**
 * Project AI Analysis Component
 * @module components/features/projects/project-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for project-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import { motion } from "framer-motion";
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

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderProjectAnalysis(
  analysis: ProjectAiAnalysisResponse,
  { AnalysisSection, TerminalListItem, TechDetail, skipAnimation }: AnalysisRenderHelpers,
) {
  return (
    <>
      <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
        {analysis.summary}
      </AnalysisSection>

      {analysis.keyFeatures.length > 0 && (
        <AnalysisSection
          label="Key Features"
          index={1}
          accentColor="#9ece6a"
          skipAnimation={skipAnimation}
        >
          <ul className="space-y-1.5 mt-1">
            {analysis.keyFeatures.map((feature, idx) => (
              <TerminalListItem key={idx} index={idx} skipAnimation={skipAnimation}>
                {feature}
              </TerminalListItem>
            ))}
          </ul>
        </AnalysisSection>
      )}

      <AnalysisSection
        label="Target Users"
        index={2}
        accentColor="#e0af68"
        skipAnimation={skipAnimation}
      >
        {analysis.targetUsers}
      </AnalysisSection>

      {(analysis.technicalDetails.architecture ||
        analysis.technicalDetails.complexity ||
        analysis.technicalDetails.maturity) && (
        <AnalysisSection
          label="Technical Details"
          index={3}
          accentColor="#bb9af7"
          skipAnimation={skipAnimation}
        >
          <div className="space-y-1 mt-1 bg-black/20 rounded p-3 border border-[#3d4f70]/50">
            {analysis.technicalDetails.architecture && (
              <TechDetail label="architecture" value={analysis.technicalDetails.architecture} />
            )}
            {analysis.technicalDetails.complexity && (
              <TechDetail label="complexity" value={analysis.technicalDetails.complexity} />
            )}
            {analysis.technicalDetails.maturity && (
              <TechDetail label="maturity" value={analysis.technicalDetails.maturity} />
            )}
          </div>
        </AnalysisSection>
      )}

      <AnalysisSection
        label="Unique Value"
        index={4}
        accentColor="#73daca"
        skipAnimation={skipAnimation}
      >
        {analysis.uniqueValue}
      </AnalysisSection>

      {analysis.relatedProjects.length > 0 && (
        <AnalysisSection
          label="Related Projects"
          index={5}
          accentColor="#ff9e64"
          skipAnimation={skipAnimation}
        >
          <div className="flex flex-wrap gap-1.5 mt-1">
            {analysis.relatedProjects.map((item, idx) => (
              <motion.span
                key={idx}
                initial={skipAnimation ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="px-2 py-0.5 text-xs font-mono bg-[#ff9e64]/10 text-[#ff9e64] rounded border border-[#ff9e64]/20"
              >
                {item}
              </motion.span>
            ))}
          </div>
        </AnalysisSection>
      )}
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
}: ProjectAiAnalysisProps) {
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
