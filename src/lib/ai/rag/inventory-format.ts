/**
 * RAG Inventory Formatting Helpers
 *
 * Normalizes inventory lines, section headers, and token-aware truncation.
 *
 * @module lib/ai/rag/inventory-format
 */

import type {
  InventorySectionBuildResult,
  InventorySectionName,
  InventorySectionSummary,
  InventoryStatus,
} from "@/types/rag";

export const CHARS_PER_TOKEN = 4;

export const SECTION_LABELS: Record<InventorySectionName, string> = {
  investments: "Investments",
  projects: "Projects",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
  courses: "Courses",
  blog: "Blog Posts",
  bookmarks: "Bookmarks",
  books: "Books",
  tags: "Tags",
  analysis: "AI Analysis",
  thoughts: "Thoughts",
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item))
      .join(", ");
  }
  return String(value).replace(/\s+/g, " ").trim();
};

export const formatLine = (pairs: Record<string, unknown>): string => {
  const parts = Object.entries(pairs)
    .map(([key, value]) => ({ key, value: normalizeValue(value) }))
    .filter((entry) => entry.value.length > 0)
    .map((entry) => `${entry.key}=${entry.value}`);
  return parts.join(" | ");
};

const formatHeader = (
  name: InventorySectionName,
  totalItems: number,
  status: InventoryStatus,
  fields: string[],
): string =>
  `[${SECTION_LABELS[name]}] count=${totalItems} status=${status} fields=${fields.join(",")}`;

export const buildSectionLines = (args: {
  name: InventorySectionName;
  fields: string[];
  rows: string[];
  status: InventoryStatus;
  note?: string;
  maxChars?: number;
}): InventorySectionBuildResult => {
  const { name, fields, rows, status, note, maxChars } = args;
  const header = formatHeader(name, rows.length, status, fields);
  const baseLines = [header, ...(note ? [`- note=${normalizeValue(note)}`] : [])];
  const entryLines = rows.map((row) => `- ${row}`);

  if (!maxChars) {
    return {
      name,
      totalItems: rows.length,
      includedItems: rows.length,
      status,
      truncated: false,
      lines: [...baseLines, ...entryLines, ""],
    };
  }

  if (maxChars <= 0) {
    return {
      name,
      totalItems: rows.length,
      includedItems: 0,
      status,
      truncated: true,
      lines: [],
    };
  }

  const lines: string[] = [];
  let usedChars = 0;
  const appendLine = (line: string): boolean => {
    const extra = (lines.length > 0 ? 1 : 0) + line.length;
    if (usedChars + extra > maxChars) return false;
    lines.push(line);
    usedChars += extra;
    return true;
  };

  for (const baseLine of baseLines) {
    if (!appendLine(baseLine)) {
      const truncatedLine = baseLine.slice(0, Math.max(0, maxChars - 3)) + "...";
      return {
        name,
        totalItems: rows.length,
        includedItems: 0,
        status,
        truncated: true,
        lines: truncatedLine ? [truncatedLine] : [],
      };
    }
  }

  let includedItems = 0;
  let truncated = false;
  for (const entryLine of entryLines) {
    if (!appendLine(entryLine)) {
      truncated = true;
      break;
    }
    includedItems += 1;
  }

  if (truncated) {
    appendLine(`- [Inventory truncated] included ${includedItems} of ${rows.length}`);
  }

  appendLine("");

  return {
    name,
    totalItems: rows.length,
    includedItems,
    status,
    truncated,
    lines,
  };
};

export const buildSectionSummaries = (
  sections: InventorySectionBuildResult[],
): InventorySectionSummary[] =>
  sections.map((section) => ({
    name: section.name,
    totalItems: section.totalItems,
    includedItems: section.includedItems,
    status: section.status,
    truncated: section.truncated,
  }));

export const resolveInventoryStatus = (
  sections: InventorySectionBuildResult[],
): InventoryStatus => {
  const failed = sections.filter((section) => section.status === "failed");
  const partial = sections.filter((section) => section.status === "partial");
  if (failed.length === sections.length && sections.length > 0) return "failed";
  if (failed.length > 0 || partial.length > 0) return "partial";
  return "success";
};

export const formatInventoryText = (
  sections: InventorySectionBuildResult[],
  maxTokens?: number,
): { text: string; tokenEstimate: number; omittedSections: InventorySectionName[] } => {
  const maxChars = typeof maxTokens === "number" ? maxTokens * CHARS_PER_TOKEN : undefined;
  const lines: string[] = ["=== INVENTORY CATALOG ===", ""]; // Blank line for readability
  let usedChars = lines.join("\n").length;
  const omittedSections: InventorySectionName[] = [];

  for (const section of sections) {
    const sectionText = section.lines.join("\n");
    const sectionChars = sectionText.length + 1; // include newline

    if (maxChars && usedChars + sectionChars > maxChars) {
      const remaining = maxChars - usedChars;
      const truncatedSection = buildSectionLines({
        name: section.name,
        fields: [],
        rows: [],
        status: "partial",
        note: "Inventory section omitted due to token budget",
        maxChars: Math.max(0, remaining),
      });
      lines.push(...truncatedSection.lines);
      omittedSections.push(section.name);
      break;
    }

    lines.push(...section.lines);
    usedChars += sectionChars;
  }

  if (omittedSections.length > 0) {
    lines.push(
      `[Inventory truncated] omitted sections: ${omittedSections.map((s) => SECTION_LABELS[s]).join(", ")}`,
    );
  }

  const text = lines.join("\n");
  return { text, tokenEstimate: estimateTokens(text), omittedSections };
};
