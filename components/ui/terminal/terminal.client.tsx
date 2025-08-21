/**
 * Terminal.client.tsx
 *
 * This file is a client-side component that dynamically imports the Terminal component.
 * It is used to render the Terminal component on the client side.
 *
 */

"use client";

import dynamic from "next/dynamic";
import { TerminalSkeleton } from "./terminal-loader.client";

// Import the renamed implementation file
const TerminalComponent = dynamic(() => import("./terminal-implementation.client").then(mod => mod.Terminal), {
  ssr: false, // Disable SSR to avoid hydration mismatches caused by client-only features
  loading: () => <TerminalSkeleton />, // Use consistent skeleton across imports
});

// This Client Component renders the Terminal
export function ClientTerminal() {
  return <TerminalComponent />;
}

// Optional: Export as default if preferred
// export default ClientTerminal;
