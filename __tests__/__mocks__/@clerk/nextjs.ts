/**
 * Mock for @clerk/nextjs
 * Provides stub implementations for Clerk auth hooks and components
 */
import { vi } from "vitest";
import type { ReactNode } from "react";

// Mock useClerk hook
export const useClerk = vi.fn(() => ({
  signOut: vi.fn(),
  openSignIn: vi.fn(),
  openSignUp: vi.fn(),
  openUserProfile: vi.fn(),
  session: null,
  user: null,
  loaded: true,
}));

// Mock useUser hook
export const useUser = vi.fn(() => ({
  user: null,
  isLoaded: true,
  isSignedIn: false,
}));

// Mock useAuth hook
export const useAuth = vi.fn(() => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken: vi.fn().mockResolvedValue(null),
}));

// Mock useSession hook
export const useSession = vi.fn(() => ({
  session: null,
  isLoaded: true,
  isSignedIn: false,
}));

// Mock ClerkProvider component
export const ClerkProvider = ({ children }: { children: ReactNode }): ReactNode => children;

// Mock SignIn component
export const SignIn = (): null => null;

// Mock SignUp component
export const SignUp = (): null => null;

// Mock SignedIn component (renders nothing - user not signed in during tests)
export const SignedIn = ({ children: _children }: { children: ReactNode }): null => null;

// Mock SignedOut component (renders children - user is signed out during tests)
export const SignedOut = ({ children }: { children: ReactNode }): ReactNode => children;

// Mock UserButton component
export const UserButton = (): null => null;

// Default export for CommonJS compatibility
export default {
  useClerk,
  useUser,
  useAuth,
  useSession,
  ClerkProvider,
  SignIn,
  SignUp,
  SignedIn,
  SignedOut,
  UserButton,
};
