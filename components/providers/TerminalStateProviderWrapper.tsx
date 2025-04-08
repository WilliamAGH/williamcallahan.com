/**
 * Client component wrapper for TerminalWindowStateProvider.
 * This ensures the context provider logic is strictly contained within
 * a client boundary, preventing potential issues when used in server components.
 */

"use client";

import React, { ReactNode } from 'react';
import { TerminalWindowStateProvider, WindowState } from '@/lib/context/TerminalWindowStateContext';

interface TerminalStateProviderWrapperProps {
  children: ReactNode;
  terminalId: string;
  initialState?: WindowState;
}

export function TerminalStateProviderWrapper({
  children,
  terminalId,
  initialState = 'normal',
}: TerminalStateProviderWrapperProps) {
  // Simply render the original provider with the passed props
  return (
    <TerminalWindowStateProvider terminalId={terminalId} initialState={initialState}>
      {children}
    </TerminalWindowStateProvider>
  );
}