"use client";

import { motion } from "framer-motion";
import type { AnalysisRenderHelpers } from "@/types/ai-analysis";

// Shared section renderers for AI analysis domain components.

/** Renders a string array as animated bullet-point TerminalListItems */
export function BulletListSection({
  items,
  label,
  index,
  accentColor,
  helpers,
}: Readonly<{
  items: string[] | undefined;
  label: string;
  index: number;
  accentColor: string;
  helpers: AnalysisRenderHelpers;
}>) {
  const { AnalysisSection, TerminalListItem, skipAnimation } = helpers;
  if (!items || items.length === 0) return null;

  return (
    <AnalysisSection
      label={label}
      index={index}
      accentColor={accentColor}
      skipAnimation={skipAnimation}
    >
      <ul className="space-y-1.5 mt-1">
        {items.map((item, idx) => (
          <TerminalListItem key={item} index={idx} skipAnimation={skipAnimation}>
            {item}
          </TerminalListItem>
        ))}
      </ul>
    </AnalysisSection>
  );
}

/** Renders a string array as animated chip badges with staggered fade-in */
export function ChipListSection({
  items,
  label,
  index,
  accentColor,
  chipClassName,
  helpers,
}: Readonly<{
  items: string[] | undefined;
  label: string;
  index: number;
  accentColor: string;
  chipClassName: string;
  helpers: AnalysisRenderHelpers;
}>) {
  const { AnalysisSection, skipAnimation } = helpers;
  if (!items || items.length === 0) return null;

  return (
    <AnalysisSection
      label={label}
      index={index}
      accentColor={accentColor}
      skipAnimation={skipAnimation}
    >
      <div className="flex flex-wrap gap-1.5 mt-1">
        {items.map((item, idx) => (
          <motion.span
            key={item}
            initial={skipAnimation ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className={chipClassName}
          >
            {item}
          </motion.span>
        ))}
      </div>
    </AnalysisSection>
  );
}

/** Renders nullable key-value detail entries, filtering out empty values */
export function TechDetailsSection({
  details,
  label,
  index,
  accentColor,
  helpers,
}: Readonly<{
  details: Array<{ label: string; value: string | null | undefined }>;
  label: string;
  index: number;
  accentColor: string;
  helpers: AnalysisRenderHelpers;
}>) {
  const { AnalysisSection, TechDetail, skipAnimation } = helpers;
  const activeDetails = details.filter(
    (detail): detail is { label: string; value: string } =>
      typeof detail.value === "string" && detail.value.length > 0,
  );
  if (activeDetails.length === 0) return null;

  return (
    <AnalysisSection
      label={label}
      index={index}
      accentColor={accentColor}
      skipAnimation={skipAnimation}
    >
      <div className="space-y-1 mt-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700/50">
        {activeDetails.map((d) => (
          <TechDetail key={d.label} label={d.label} value={d.value} />
        ))}
      </div>
    </AnalysisSection>
  );
}
