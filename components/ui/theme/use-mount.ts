/**
 * Mount Hook
 *
 * Custom hook to handle component mounting state.
 * Prevents hydration mismatch in theme components.
 */

import { useEffect, useState } from "react";

export function useMount() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
