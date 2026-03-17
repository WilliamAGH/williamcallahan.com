/**
 * Safe Clerk Hook
 *
 * Provides a safe Clerk context that always exists, even when Clerk is disabled.
 * The actual Clerk hook stays inside the configured provider boundary.
 */

"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ClerkSafeInterface, SignOutOptions } from "@/types/features/clerk";

/**
 * No-op Clerk implementation for when Clerk is not configured.
 * Stable reference - never recreated.
 */
export const noOpClerk: ClerkSafeInterface = {
  signOut: (_options?: SignOutOptions) => {
    console.warn("[Clerk] signOut called but Clerk is not configured");
    return Promise.resolve();
  },
};

const ClerkSafeContext = createContext<ClerkSafeInterface>(noOpClerk);

export function ClerkSafeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ClerkSafeInterface;
}) {
  return createElement(ClerkSafeContext.Provider, { value }, children);
}

/**
 * Safe version of Clerk access for components that only need the minimal action surface.
 */
export function useClerkSafe(): ClerkSafeInterface {
  return useContext(ClerkSafeContext);
}
