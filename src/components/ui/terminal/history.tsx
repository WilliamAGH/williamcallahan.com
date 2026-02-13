/**
 * Terminal History Component
 *
 * Displays command history with proper word wrapping and
 * prevents unwanted text truncation on mobile devices.
 *
 * This is a shared component that can be used in both client and server contexts.
 *
 * Supports two modes:
 * - "default": Shows all command types (standard terminal mode)
 * - "chat": Shows only chat messages (AI chat mode, for inline rendering)
 */

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  type HistoryProps,
  type TerminalCommand,
  isTextCommand,
  isNavigationCommand,
  isClearCommand,
  isErrorCommand,
  isHelpCommand,
  isSelectionCommand,
  isSearchingCommand,
  isChatCommand,
} from "@/types";

const TERMINAL_LINK_CLASS =
  "text-[#7aa2f7] underline underline-offset-2 hover:text-[#9ab7ff] transition-colors";

const SAFE_INTERNAL_PATH_PATTERN = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/?#[\]%]*$/;
const SAFE_EXTERNAL_URL_PATTERN =
  /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[A-Za-z0-9\-._~!$&'()*+,;=:@/?#[\]%]*)?$/;

function isInternalSlugPath(value: string): boolean {
  return SAFE_INTERNAL_PATH_PATTERN.test(value);
}

function isExternalUrl(value: string): boolean {
  return SAFE_EXTERNAL_URL_PATTERN.test(value);
}

/**
 * Structural extractors only — no URL validation here.
 * Validation is centralized in renderChatLine.
 */
const CHAT_LINK_PATTERNS: Array<{
  regex: RegExp;
  extract: (
    match: RegExpMatchArray,
  ) => { prefix: string; text: string; url: string; suffix: string } | null;
}> = [
  {
    // Markdown link: - [Title](url) optional trailing text
    regex: /^- *\[([^\]]+)\]\(([^)]+)\)(.*)$/,
    extract: (m) => {
      const text = m[1]?.trim();
      const url = m[2]?.trim();
      if (!text || !url) return null;
      return { prefix: "- ", text, url, suffix: m[3] ?? "" };
    },
  },
  {
    // Label: /internal-path
    regex: /^- *(.+?):\s*(\/\S+)\s*$/,
    extract: (m) => {
      const text = m[1]?.trim();
      const url = m[2]?.trim();
      if (!text || !url) return null;
      return { prefix: "- ", text, url, suffix: "" };
    },
  },
  {
    // URL: /internal-path
    regex: /^URL:\s*(\/\S+)\s*$/,
    extract: (m) => {
      const url = m[1]?.trim();
      if (!url) return null;
      return { prefix: "URL: ", text: url, url, suffix: "" };
    },
  },
  {
    // Standalone external URL: - https://example.com
    regex: /^- *(https:\/\/\S+)\s*$/,
    extract: (m) => {
      const url = m[1]?.trim();
      if (!url) return null;
      return { prefix: "- ", text: url, url, suffix: "" };
    },
  },
];

/** Centralized URL validation + link rendering for a single chat line */
function renderChatLine(line: string): ReactNode {
  for (const { regex, extract } of CHAT_LINK_PATTERNS) {
    const match = line.match(regex);
    if (!match) continue;
    const parsed = extract(match);
    if (!parsed) continue;

    const external = isExternalUrl(parsed.url);
    if (!external && !isInternalSlugPath(parsed.url)) continue;

    const linkProps = external
      ? { href: parsed.url, target: "_blank" as const, rel: "noopener noreferrer" }
      : { href: parsed.url };
    return (
      <>
        {parsed.prefix}
        <a {...linkProps} className={TERMINAL_LINK_CLASS}>
          {parsed.text}
        </a>
        {parsed.suffix}
      </>
    );
  }
  return line;
}

function renderChatOutput(outputContent: string): ReactNode {
  const lines = outputContent.split("\n");
  return lines.map((line, index) => (
    <span key={index}>
      {renderChatLine(line)}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

export function History({ history, mode = "default" }: HistoryProps) {
  // Filter history based on mode
  const filteredHistory = Array.isArray(history)
    ? mode === "chat"
      ? history.filter(isChatCommand)
      : history
    : [];

  const getOutputContent = (line: TerminalCommand): string | null => {
    if (isTextCommand(line) || isNavigationCommand(line) || isClearCommand(line)) {
      return line.output;
    }
    if (isErrorCommand(line)) {
      return line.error + (line.details ? `\n${line.details}` : "");
    }
    if (isHelpCommand(line)) {
      return line.commands
        .map((cmd) => `${cmd.name}: ${cmd.description}${cmd.usage ? ` (${cmd.usage})` : ""}`)
        .join("\n");
    }
    if (isSelectionCommand(line)) {
      return line.items.map((item) => `${item.label}: ${item.description}`).join("\n");
    }
    if (isSearchingCommand(line)) {
      const searchText = line.scope
        ? `⏳ Searching for ${line.scope} related to "${line.query}"...`
        : `⏳ Searching website for all results related to "${line.query}"...`;
      return searchText;
    }
    if (isChatCommand(line)) {
      return line.content;
    }
    return null;
  };

  // Don't render anything if history is empty
  if (filteredHistory.length === 0) {
    return null;
  }

  return (
    <div className={cn("mb-4", mode === "chat" ? "space-y-2" : "space-y-1")}>
      {filteredHistory.map((line: TerminalCommand, i) => {
        const outputContent = getOutputContent(line);
        const isChat = isChatCommand(line);
        const chatLabel = isChat ? (line.role === "user" ? "User" : "Assistant") : null;

        return (
          <div key={`${line.input}-${line.id}-${i}`}>
            {/* Command input line (not shown for chat or searching) */}
            {line.input && !isSearchingCommand(line) && !isChat && (
              <div className="flex items-start">
                <span className="text-[#7aa2f7] select-none mr-2 shrink-0">$</span>
                <span className="text-gray-300 break-words">{line.input}</span>
              </div>
            )}

            {/* Output content */}
            {outputContent &&
              (isChat ? (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2",
                    line.role === "user"
                      ? "border-blue-500/30 bg-blue-500/10"
                      : "border-gray-700/70 bg-black/20",
                  )}
                >
                  <div className="text-xs tracking-wide text-gray-400 select-none mb-1">
                    {chatLabel}
                  </div>
                  <div className="text-gray-200 whitespace-pre-wrap break-words">
                    {renderChatOutput(outputContent)}
                  </div>
                </div>
              ) : (
                <div className="text-gray-300 whitespace-pre-wrap break-words">{outputContent}</div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
