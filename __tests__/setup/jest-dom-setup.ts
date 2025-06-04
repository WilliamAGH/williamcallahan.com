/**
 * Jest DOM Setup
 * 
 * Custom setup for @testing-library/jest-dom to fix compatibility issues with Bun
 */

import '@testing-library/jest-dom';

// Fix for Bun compatibility - override RECEIVED_COLOR function if it's causing issues
const originalReceived = (global as any).jest?.expect?.getState?.()?.utils?.RECEIVED_COLOR;
if (typeof originalReceived !== 'function') {
  // Provide a fallback implementation for RECEIVED_COLOR
  if ((global as any).jest?.expect?.getState?.()?.utils) {
    (global as any).jest.expect.getState().utils.RECEIVED_COLOR = (text: string) => text;
  }
} 