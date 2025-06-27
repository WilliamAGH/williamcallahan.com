/**
 * Next.js Instrumentation Hook
 * 
 * This file is loaded once when the Next.js server starts.
 * It dynamically imports the appropriate instrumentation based on the runtime.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run instrumentation in server/node runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import Node.js specific instrumentation
    await import('./instrumentation-node');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    // Dynamically import Edge runtime specific instrumentation
    await import('./instrumentation-edge');
  }
}