"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type {
  TerminalContextProps,
  ContextType,
  ContextContent,
  TerminalContextPhase,
} from "@/types/schemas/personal-context-note";

const CLOSE_BUTTON_CLASSES = cn(
  "text-zinc-900 dark:text-zinc-100",
  "hover:text-amber-500 dark:hover:text-amber-400",
  "transition-colors cursor-pointer",
  "focus:outline-none focus-visible:text-amber-500",
);

const CONTENT: Record<ContextType, ContextContent> = {
  bookmark: {
    what: "bookmarks I found on the web",
    why: [
      "The internet is full of incredible tools, ideas, and resources.",
      "I organize what I find to make it searchable and discoverable.",
    ],
    more: [
      "Everything here is enriched with AI analysis and connected via semantic search.",
      "I built this for myself first, then thought others might find it useful too.",
    ],
  },
  book: {
    what: "a book from my personal reading library",
    why: [
      "I wanted a beautiful UI for easier searching and discovery.",
      "Shared to make it easy to find my past reading and related notes.",
    ],
    more: [
      "Books are inherently social and connected, so I wanted to see related content, and",
      "decided sharing it with others might help me connect with people who have similar interests.",
    ],
  },
  thought: {
    what: "a thought I write down for later reflection",
    why: [
      "It's probably not polished enough for a blog post.",
      "But worth putting somewhere for later access.",
    ],
    more: [
      "Thoughts are rougher, quicker, more raw, and not always polished.",
      "If you're reading this, you're seeing the unfiltered version.",
      "Sharing in case it still might help others like you.",
    ],
  },
};

function useTypingAnimation(text: string, isActive: boolean, onComplete?: () => void) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isActive) {
      setDisplayedText("");
      setIsTyping(false);
      return;
    }

    if (displayedText.length < text.length) {
      setIsTyping(true);
      timeoutRef.current = setTimeout(
        () => {
          setDisplayedText(text.slice(0, displayedText.length + 1));
        },
        20 + Math.random() * 15,
      );
    } else if (displayedText.length >= text.length && isTyping) {
      setIsTyping(false);
      onCompleteRef.current?.();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActive, displayedText, text, isTyping]);

  return { displayedText, isTyping };
}

export function TerminalContext({ type, className }: TerminalContextProps) {
  const [phase, setPhase] = useState<TerminalContextPhase>("idle");
  const content = CONTENT[type];

  const handleWhatComplete = useCallback(() => {
    setPhase("what-done");
  }, []);

  const { displayedText: whatText, isTyping: whatTyping } = useTypingAnimation(
    content.what,
    phase === "what-typing" ||
      phase === "what-done" ||
      phase === "why-expanded" ||
      phase === "more-expanded",
    handleWhatComplete,
  );

  const handleWhatClick = () => {
    if (phase === "idle") {
      setPhase("what-typing");
    }
  };

  const handleWhyClick = () => {
    if (phase === "what-done") {
      setPhase("why-expanded");
    }
  };

  const handleMoreClick = () => {
    if (phase === "why-expanded") {
      setPhase("more-expanded");
    }
  };

  const handleClose = () => {
    setPhase("idle");
  };

  // Inline phase (idle, what-typing, what-done)
  const isInlinePhase = phase === "idle" || phase === "what-typing" || phase === "what-done";

  return (
    <div className={cn("relative", className)}>
      {/* Inline display for early phases */}
      {isInlinePhase && (
        <span className="inline">
          {/* Opening comment */}
          <span className="font-mono text-[0.7rem] text-zinc-300 dark:text-zinc-600">{"/*"}</span>

          {/* Idle: "What is this?" trigger */}
          {phase === "idle" && (
            <button
              type="button"
              onClick={handleWhatClick}
              className={cn(
                "font-mono text-[0.7rem] mx-1",
                "text-zinc-400 dark:text-zinc-500",
                "hover:text-amber-500 dark:hover:text-amber-400",
                "transition-colors cursor-pointer",
                "focus:outline-none focus-visible:text-amber-500",
              )}
            >
              What is this?
            </button>
          )}

          {/* What typing/done: streamed text */}
          {phase !== "idle" && (
            <span className="font-mono text-[0.7rem] mx-1 text-zinc-500 dark:text-zinc-400">
              {whatText}
              {whatTyping && (
                <span className="animate-pulse text-amber-400 dark:text-amber-500">▊</span>
              )}
            </span>
          )}

          {/* What done: "Why?" and "close" options */}
          {phase === "what-done" && (
            <>
              <span className="font-mono text-[0.7rem] text-zinc-300 dark:text-zinc-600 mx-0.5">
                —
              </span>
              <button
                type="button"
                onClick={handleWhyClick}
                className={cn(
                  "font-mono text-[0.7rem]",
                  "text-zinc-400 dark:text-zinc-500",
                  "hover:text-amber-500 dark:hover:text-amber-400",
                  "transition-colors cursor-pointer",
                  "focus:outline-none focus-visible:text-amber-500",
                )}
              >
                Why?
              </button>
              <span className="font-mono text-[0.7rem] text-zinc-300 dark:text-zinc-600 mx-0.5">
                /
              </span>
              <button
                type="button"
                onClick={handleClose}
                className={cn("font-mono text-[0.7rem]", CLOSE_BUTTON_CLASSES)}
              >
                close
              </button>
            </>
          )}

          {/* Closing comment */}
          <span
            className={cn(
              "font-mono text-[0.7rem] text-zinc-300 dark:text-zinc-600 ml-1",
              whatTyping ? "opacity-0" : "opacity-100",
              "transition-opacity duration-200",
            )}
          >
            {"*/"}
          </span>
        </span>
      )}

      {/* Expanded multi-line block for why/more phases */}
      <AnimatePresence>
        {(phase === "why-expanded" || phase === "more-expanded") && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-3"
          >
            {/* The expanded card */}
            <div
              className={cn(
                "relative",
                "font-mono text-[0.72rem] leading-relaxed",
                "text-zinc-500 dark:text-zinc-400",
                "pl-3 border-l-2 border-zinc-200 dark:border-zinc-700",
              )}
            >
              {/* What line (always shown) */}
              <p className="text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-300 dark:text-zinc-600">{"/* "}</span>
                {content.what}
              </p>

              {/* Why lines */}
              <div className="mt-2 space-y-1">
                {content.why.map((line, i) => (
                  <p key={`why-${i}`} className="text-zinc-500 dark:text-zinc-400">
                    {line}
                  </p>
                ))}
              </div>

              {/* Action row: "tell me more..." / "close" */}
              {phase === "why-expanded" && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMoreClick}
                    className={cn(
                      "text-zinc-400 dark:text-zinc-500",
                      "hover:text-amber-500 dark:hover:text-amber-400",
                      "transition-colors cursor-pointer",
                      "focus:outline-none focus-visible:text-amber-500",
                    )}
                  >
                    tell me more...
                  </button>
                  <span className="text-zinc-300 dark:text-zinc-600">/</span>
                  <button type="button" onClick={handleClose} className={CLOSE_BUTTON_CLASSES}>
                    close
                  </button>
                </div>
              )}

              {/* More content (expanded) */}
              <AnimatePresence>
                {phase === "more-expanded" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                      {content.more.map((para, i) => (
                        <p key={`more-${i}`} className="text-zinc-500 dark:text-zinc-400">
                          {para}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Close option at fully-expanded state */}
              {phase === "more-expanded" && (
                <button
                  type="button"
                  onClick={handleClose}
                  className={cn("mt-3 block", CLOSE_BUTTON_CLASSES)}
                >
                  close
                </button>
              )}

              {/* Closing comment */}
              <p className="mt-3 text-zinc-300 dark:text-zinc-600">{"*/"}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
