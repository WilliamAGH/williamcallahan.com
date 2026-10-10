/**
 * Mock for @clerk/nextjs
 * Provides stub implementations for Clerk auth hooks and components
 */
import { vi, type Mock } from "vitest";
import type { ReactNode } from "react";
import type * as ClerkNextjs from "@clerk/nextjs";

type LoadedClerk = ReturnType<typeof ClerkNextjs.useClerk>;
type GetToken = ReturnType<typeof ClerkNextjs.useAuth>["getToken"];

interface MockClerk {
  signOut: Mock<LoadedClerk["signOut"]>;
  openSignIn: Mock<LoadedClerk["openSignIn"]>;
  openSignUp: Mock<LoadedClerk["openSignUp"]>;
  openUserProfile: Mock<LoadedClerk["openUserProfile"]>;
  session: null;
  user: null;
  loaded: boolean;
}

interface MockUserState {
  user: null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

interface MockAuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: null;
  sessionId: null;
  getToken: Mock<GetToken>;
}

interface MockSessionState {
  session: null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

// Mock useClerk hook
export const useClerk = vi.fn<() => MockClerk>(() => ({
  signOut: vi.fn<LoadedClerk["signOut"]>(),
  openSignIn: vi.fn<LoadedClerk["openSignIn"]>(),
  openSignUp: vi.fn<LoadedClerk["openSignUp"]>(),
  openUserProfile: vi.fn<LoadedClerk["openUserProfile"]>(),
  session: null,
  user: null,
  loaded: true,
}));

// Mock useUser hook
export const useUser = vi.fn<() => MockUserState>(() => ({
  user: null,
  isLoaded: true,
  isSignedIn: false,
}));

// Mock useAuth hook
export const useAuth = vi.fn<() => MockAuthState>(() => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken: vi.fn<GetToken>().mockResolvedValue(null),
}));

// Mock useSession hook
export const useSession = vi.fn<() => MockSessionState>(() => ({
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
