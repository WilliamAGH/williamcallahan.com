"use client";

/**
 * AI Analysis Terminal UI Components
 * @module components/features/ai-analysis/ai-analysis-terminal-ui.client
 * @description
 * Shared UI sub-components for terminal-style AI analysis rendering.
 * Extracted from the main terminal component to maintain 350-line limit.
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Blinking Cursor
// ─────────────────────────────────────────────────────────────────────────────

export function BlinkingCursor() {
  return <span className="inline-block w-2 h-4 bg-[#7aa2f7] ml-1 animate-pulse" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Loading
// ─────────────────────────────────────────────────────────────────────────────

export function TerminalLoading({ message }: { message: string }) {
  return (
    <div className="font-mono text-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <span className="text-[#7aa2f7]">$</span>
        <span>analyze</span>
      </div>
      <div className="flex items-center gap-2 text-[#9ece6a]">
        <span className="animate-spin">⠋</span>
        <span>{message}</span>
        <BlinkingCursor />
      </div>
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
  accentColor = "#7aa2f7",
  skipAnimation = false,
}: {
  label: string;
  children: ReactNode;
  index: number;
  accentColor?: string;
  skipAnimation?: boolean;
}) {
  return (
    <motion.div
      initial={skipAnimation ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
      className="group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ChevronRight
          className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
          style={{ color: accentColor }}
        />
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: accentColor }}>
          {label}
        </span>
      </div>
      <div className="pl-5 text-sm text-gray-300 leading-relaxed">{children}</div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal List Item
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
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-2 text-gray-400"
    >
      <span className="text-[#565f89] select-none mt-0.5">→</span>
      <span>{children}</span>
    </motion.li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tech Detail
// ─────────────────────────────────────────────────────────────────────────────

export function TechDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-xs">
      <span className="text-[#565f89]">{label}:</span>
      <span className="text-[#bb9af7]">{value}</span>
    </div>
  );
}
