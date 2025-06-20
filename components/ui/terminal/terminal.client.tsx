/**
 * Terminal.client.tsx
 *
 * This file is a client-side component that dynamically imports the Terminal component.
 * It is used to render the Terminal component on the client side.
 *
 */

"use client";

import dynamic from "next/dynamic";

// A visually-hidden placeholder to preserve layout without displaying a dark bar.
// Using Tailwind utility classes keeps it consistent with the rest of the project.
const TerminalLoading = () => <div aria-hidden="true" className="h-7 mt-4 mb-4 rounded-lg opacity-0" />;

// Import the renamed implementation file
const TerminalComponent = dynamic(() => import("./terminal-implementation.client").then((mod) => mod.Terminal), {
  ssr: false, // Disable SSR to avoid hydration mismatches caused by client-only features
  loading: () => <TerminalLoading />, // Add the server-renderable loading component
});

// This Client Component renders the Terminal
export function ClientTerminal() {
  return <TerminalComponent />;
}

// Optional: Export as default if preferred
// export default ClientTerminal;
