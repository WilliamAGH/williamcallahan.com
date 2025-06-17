/**
 * Terminal.client.tsx
 *
 * This file is a client-side component that dynamically imports the Terminal component.
 * It is used to render the Terminal component on the client side.
 *
 */

"use client";

import dynamic from "next/dynamic";
import React from "react";

// A simple placeholder component to be rendered on the server
const TerminalLoading = () => (
  <div
    style={{
      height: "28px", // Approximate height of the terminal header
      backgroundColor: "var(--terminal-bg, #232530)", // Use CSS variable or a fallback
      borderRadius: "0.5rem",
      marginTop: "1rem",
      marginBottom: "1rem",
    }}
  />
);

// Import the renamed implementation file
const TerminalComponent = dynamic(
  () => import("./terminal-implementation.client").then((mod) => mod.Terminal),
  {
    ssr: false, // Disable SSR to avoid hydration mismatches caused by client-only features
    loading: () => <TerminalLoading />, // Add the server-renderable loading component
  },
);

// This Client Component renders the Terminal
export function ClientTerminal() {
  return <TerminalComponent />;
}

// Optional: Export as default if preferred
// export default ClientTerminal;
