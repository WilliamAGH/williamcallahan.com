"use client";

/**
 * AI Analysis UI Components
 * @module components/features/ai-analysis/ai-analysis-terminal-ui.client
 * @description
 * Shared UI sub-components for AI analysis content rendering.
 * Uses clean, modern styling that integrates naturally with page content.
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// Blinking Cursor (used during streaming)
// ─────────────────────────────────────────────────────────────────────────────

export function BlinkingCursor() {
  return (
    <span className="inline-block w-1.5 h-4 bg-gray-400 dark:bg-gray-500 ml-0.5 animate-pulse rounded-sm" />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Indicator
// ─────────────────────────────────────────────────────────────────────────────

export function TerminalLoading({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin shrink-0" />
      <span className="text-sm text-gray-500 dark:text-gray-400">{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Section
// ─────────────────────────────────────────────────────────────────────────────

export function AnalysisSection({
  label,
  children,
  index,
  skipAnimation = false,
}: {
  label: string;
  children: ReactNode;
  index: number;
  skipAnimation?: boolean;
}) {
  return (
    <motion.div
      initial={skipAnimation ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: "easeOut" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        {label}
      </h3>
      <div className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// List Item
// ─────────────────────────────────────────────────────────────────────────────

export function TerminalListItem({
  children,
  index,
  skipAnimation = false,
}: {
  children: ReactNode;
  index: number;
  skipAnimation?: boolean;
}) {
  return (
    <motion.li
      initial={skipAnimation ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400"
    >
      <span className="mt-2 w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
      <span>{children}</span>
    </motion.li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Entry
// ─────────────────────────────────────────────────────────────────────────────

export function TechDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400 font-medium capitalize">{label}</span>
      <span className="text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed Hint
// ─────────────────────────────────────────────────────────────────────────────

export function CollapsedTerminalHint({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex items-center gap-2 w-full px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      <span className="text-green-600 dark:text-green-500 text-xs">✓</span>
      <span>Analysis available</span>
      <span className="text-gray-300 dark:text-gray-600">·</span>
      <span className="text-gray-400 dark:text-gray-500">show details</span>
    </button>
  );
}
