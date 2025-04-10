/**
 * AnchorScrollManager Component
 *
 * @module components/utils/anchor-scroll-manager.client
 * @description A client component wrapper that activates the global anchor scroll handler hook.
 */
'use client';

import { useAnchorScrollHandler } from '@/lib/hooks/use-anchor-scroll.client'; // Use alias

/**
 * Client component that simply calls the useAnchorScrollHandler hook
 * to activate the global anchor scrolling logic.
 */
export function AnchorScrollManager(): null {
  useAnchorScrollHandler();
  return null; // This component doesn't render anything itself
}
