"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ThinkingDisplayProps } from "@/types/ai-analysis";

export function ThinkingDisplay({ text, tokenCount, isStreaming }: Readonly<ThinkingDisplayProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const wasStreamingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand during streaming, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
      wasStreamingRef.current = true;
    } else if (wasStreamingRef.current) {
      setIsExpanded(false);
      wasStreamingRef.current = false;
    }
  }, [isStreaming]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isStreaming, isExpanded, text]);

  if (text.length === 0) return null;

  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-[#292e42]">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 w-full px-4 py-1.5 font-mono text-xs text-[#565f89] hover:text-[#7aa2f7] transition-colors"
      >
        <Chevron className="w-3 h-3 flex-shrink-0" />
        <span>reasoning</span>
        <span>·</span>
        <span>{isStreaming ? "streaming..." : `~${tokenCount} tokens`}</span>
      </button>
      {isExpanded && (
        <div
          ref={scrollRef}
          className="max-h-32 overflow-y-auto px-4 pb-2 text-[#565f89] text-xs font-mono leading-relaxed whitespace-pre-wrap"
        >
          {text}
        </div>
      )}
    </div>
  );
}
