/**
 * Streaming parser for `<think>...</think>` tags in LLM content deltas.
 *
 * llama.cpp-hosted reasoning models (e.g. gpt-oss, DeepSeek, QwQ) embed
 * chain-of-thought inside `<think>...</think>` tags within the regular
 * `delta.content` stream. This parser separates thinking content from
 * visible content as chunks arrive, handling tag boundaries that may
 * split across multiple streaming chunks.
 *
 * @module lib/ai/openai-compatible/think-tag-parser
 */

import type { ThinkTagCallbacks } from "@/types/ai-openai-compatible";

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

export function createThinkTagParser(callbacks: ThinkTagCallbacks) {
  let insideThink = false;
  let buffer = "";

  function flush(text: string) {
    if (text.length === 0) return;
    if (insideThink) {
      callbacks.onThinking(text);
    } else {
      callbacks.onContent(text);
    }
  }

  function push(chunk: string) {
    buffer += chunk;

    while (buffer.length > 0) {
      if (insideThink) {
        const closeIdx = buffer.indexOf(CLOSE_TAG);
        if (closeIdx === -1) {
          // No close tag yet — check if buffer ends with a partial `</think>` match
          const holdBack = partialMatchLength(buffer, CLOSE_TAG);
          if (holdBack > 0) {
            flush(buffer.slice(0, -holdBack));
            buffer = buffer.slice(-holdBack);
          } else {
            flush(buffer);
            buffer = "";
          }
          return;
        }
        // Close tag found — emit thinking text before it, switch to content mode
        flush(buffer.slice(0, closeIdx));
        buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
        insideThink = false;
      } else {
        const openIdx = buffer.indexOf(OPEN_TAG);
        if (openIdx === -1) {
          const holdBack = partialMatchLength(buffer, OPEN_TAG);
          if (holdBack > 0) {
            flush(buffer.slice(0, -holdBack));
            buffer = buffer.slice(-holdBack);
          } else {
            flush(buffer);
            buffer = "";
          }
          return;
        }
        // Open tag found — emit content text before it, switch to thinking mode
        flush(buffer.slice(0, openIdx));
        buffer = buffer.slice(openIdx + OPEN_TAG.length);
        insideThink = true;
      }
    }
  }

  function end() {
    // Flush any remaining buffered text (partial tags become literal text)
    flush(buffer);
    buffer = "";
  }

  return { push, end, isInsideThink: () => insideThink };
}

/** Strip `<think>...</think>` blocks from a completed string (non-streaming). */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Returns how many trailing characters of `text` form a prefix of `tag`. */
function partialMatchLength(text: string, tag: string): number {
  const maxCheck = Math.min(text.length, tag.length - 1);
  for (let len = maxCheck; len >= 1; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
