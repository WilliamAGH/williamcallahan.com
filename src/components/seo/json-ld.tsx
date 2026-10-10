/**
 * JSON-LD Script Component
 * @module components/seo/json-ld
 * @description
 * Renders JSON-LD structured data as a script tag in the page markup.
 * This component ensures proper embedding of schema.org metadata following best practices.
 *
 * @see {@link "https://developers.google.com/search/docs/advanced/structured-data/intro-structured-data"} - Google Structured Data Guidelines
 * @see {@link "https://schema.org/"} - Schema.org Documentation
 */

"use client";

import { useState, useSyncExternalStore, type JSX } from "react";

import type { JsonLdScriptProps } from "@/types/features/seo";

const subscribeToClientRuntime = (): (() => void) => () => undefined;
const getClientRuntimeSnapshot = (): boolean => true;
const getServerRuntimeSnapshot = (): boolean => false;

/**
 * React Activity attaches host refs when the owning route becomes visible and
 * detaches them when it hides, while preserving the host DOM. Toggling the
 * script type here keeps hidden copies inert without a state round-trip.
 */
const activateJsonLdScript = (node: HTMLScriptElement): (() => void) => {
  node.type = "application/ld+json";
  return () => {
    node.type = "application/json";
  };
};

export function JsonLdScript({ data, id }: JsonLdScriptProps): JSX.Element {
  // Keep the host node stable during streamed hydration and hidden mounts inert.
  const isClientRuntime = useSyncExternalStore(
    subscribeToClientRuntime,
    getClientRuntimeSnapshot,
    getServerRuntimeSnapshot,
  );
  // Frozen at mount so the rendered attribute never changes after hydration.
  const [initialScriptType] = useState(
    isClientRuntime ? "application/json" : "application/ld+json",
  );

  /**
   * JSON-LD must be embedded using dangerouslySetInnerHTML to avoid issues
   * with the HTML parser prematurely closing the <script> tag when the JSON
   * happens to contain markup. Escaping every opening angle bracket preserves
   * valid JSON while preventing script-tag and HTML-comment termination.
   */
  const json = JSON.stringify(data, null, process.env.NODE_ENV === "development" ? 2 : 0).replace(
    /</g,
    "\\u003c",
  );

  return (
    <script
      ref={activateJsonLdScript}
      type={initialScriptType}
      {...(id ? { id } : {})}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Necessary for embedding JSON-LD, and the content is sanitized.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
