/**
 * Terminal.client.tsx
 *
 * This file is a client-side component that dynamically imports the Terminal component.
 * It is used to render the Terminal component on the client side.
 *
 */

'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamically import the actual Terminal component with SSR disabled
const TerminalComponent = dynamic(
  () => import('./terminal').then((mod) => mod.Terminal),
  {
    ssr: false,
    // Optional: Add a loading placeholder if needed
    // loading: () => <div className="h-[400px] w-full max-w-3xl mx-auto mt-8">Loading Terminal...</div>,
  }
);

// This Client Component simply renders the dynamically imported Terminal
export function ClientTerminal() {
  // You could potentially add context providers or other client-side logic here if needed
  return <TerminalComponent />;
}

// Optional: Export as default if preferred
// export default ClientTerminal;
