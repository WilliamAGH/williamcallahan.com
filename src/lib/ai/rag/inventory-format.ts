/**
 * RAG Inventory Formatting Helpers
 *
 * Normalizes inventory lines, section headers, and token-aware truncation.
 *
 * @module lib/ai/rag/inventory-format
 */

import type {
  InventoryPaginationMeta,
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

/**
 * Format a paginated section header with page info.
 */
export const formatPaginatedHeader = (
  name: InventorySectionName,
  pagination: InventoryPaginationMeta,
  fields: string[],
): string => {
  const { page, totalPages, totalItems, itemsOnPage, hasMore } = pagination;
  const pageInfo = `page=${page}/${totalPages}`;
  const itemsInfo = `showing=${itemsOnPage}`;
  const moreInfo = hasMore ? "hasMore=true" : "hasMore=false";
  const fieldsInfo = fields.length > 0 ? ` fields=${fields.join(",")}` : "";
  return `[${SECTION_LABELS[name]}] ${pageInfo} ${itemsInfo} total=${totalItems} ${moreInfo}${fieldsInfo}`;
};

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

/**
 * Build section lines with pagination support.
 * Returns a page of items with pagination metadata in the header.
 *
 * IMPORTANT: The `pageRows` parameter must be already paginated by the caller
 * (e.g., via `paginateRows()`). This function only formats the rows; it does not slice.
 */
export const buildPaginatedSectionLines = (args: {
  name: InventorySectionName;
  fields: string[];
  pageRows: string[];
  pagination: InventoryPaginationMeta;
  status: InventoryStatus;
}): InventorySectionBuildResult => {
  const { name, fields, pageRows, pagination, status } = args;
  const { page, totalPages, totalItems, itemsOnPage, hasMore } = pagination;

  // Build header with pagination info
  const header = formatPaginatedHeader(name, pagination, fields);
  const entryLines = pageRows.map((row) => `- ${row}`);

  // Add navigation hint
  const navHint = hasMore
    ? `- [Page ${page} of ${totalPages}] Say "next" or "more" for next page`
    : `- [Page ${page} of ${totalPages}] This is the last page`;

  return {
    name,
    totalItems,
    includedItems: itemsOnPage,
    status,
    truncated: page < totalPages, // Consider truncated if not showing all pages
    lines: [header, ...entryLines, navHint, ""],
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

/**
 * Truncate section lines to fit within a character budget.
 * Preserves header and as many entry lines as possible.
 */
const truncateSectionLines = (
  sectionLines: string[],
  name: InventorySectionName,
  totalItems: number,
  maxChars: number,
): { lines: string[]; includedItems: number } => {
  if (maxChars <= 0) return { lines: [], includedItems: 0 };

  const result: string[] = [];
  let usedChars = 0;
  let includedItems = 0;

  for (const line of sectionLines) {
    const lineChars = line.length + (result.length > 0 ? 1 : 0); // +1 for newline separator
    if (usedChars + lineChars > maxChars) break;

    result.push(line);
    usedChars += lineChars;

    // Count entry lines (those starting with "- " but not notes or truncation markers)
    if (line.startsWith("- ") && !line.startsWith("- note=") && !line.startsWith("- [Inventory")) {
      includedItems++;
    }
  }

  // Add truncation note if we didn't include all items
  if (includedItems < totalItems && includedItems > 0) {
    const truncNote = `- [Truncated] showing ${includedItems} of ${totalItems} items`;
    const noteChars = truncNote.length + 1;
    if (usedChars + noteChars <= maxChars) {
      result.push(truncNote);
    }
  }

  return { lines: result, includedItems };
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
      // Truncate section lines to fit remaining budget (preserves partial data over full omission)
      const remaining = maxChars - usedChars;
      const truncated = truncateSectionLines(
        section.lines,
        section.name,
        section.totalItems,
        remaining,
      );

      if (truncated.lines.length > 0 && truncated.includedItems > 0) {
        // We fit some items - add them as a partial section
        lines.push(...truncated.lines);
        if (truncated.includedItems < section.totalItems) {
          omittedSections.push(section.name); // Mark as partially omitted
        }
      } else {
        // No items fit - add a note explaining the section was omitted
        const omitNote = `[${SECTION_LABELS[section.name]}] omitted - ${section.totalItems} items (token budget exceeded)`;
        if (usedChars + omitNote.length + 1 <= maxChars) {
          lines.push(omitNote);
        }
        omittedSections.push(section.name);
      }
      break; // Stop processing further sections
    }

    lines.push(...section.lines);
    usedChars += sectionChars;
  }

  if (omittedSections.length > 0) {
    lines.push(
      `[Inventory truncated] affected sections: ${omittedSections.map((s) => SECTION_LABELS[s]).join(", ")}`,
    );
  }

  const text = lines.join("\n");
  return { text, tokenEstimate: estimateTokens(text), omittedSections };
};
