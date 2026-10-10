/**
 * Mount Hook
 *
 * Reports whether the component renders on the client after hydration.
 * Prevents hydration mismatch in client-only UI: the server snapshot (false)
 * is used for SSR and the hydration pass, the client snapshot (true) afterwards.
 */

import { useSyncExternalStore } from "react";

const subscribeToNothing = (): (() => void) => () => undefined;
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

export function useMount(): boolean {
  return useSyncExternalStore(subscribeToNothing, getClientSnapshot, getServerSnapshot);
}
