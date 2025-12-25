/**
 * Mock for @clerk/nextjs
 * Provides stub implementations for Clerk auth hooks and components
 */

// Mock useClerk hook
const useClerk = jest.fn(() => ({
  signOut: jest.fn(),
  openSignIn: jest.fn(),
  openSignUp: jest.fn(),
  openUserProfile: jest.fn(),
  session: null,
  user: null,
  loaded: true,
}));

// Mock useUser hook
const useUser = jest.fn(() => ({
  user: null,
  isLoaded: true,
  isSignedIn: false,
}));

// Mock useAuth hook
const useAuth = jest.fn(() => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken: jest.fn().mockResolvedValue(null),
}));

// Mock useSession hook
const useSession = jest.fn(() => ({
  session: null,
  isLoaded: true,
  isSignedIn: false,
}));

// Mock ClerkProvider component
const ClerkProvider = ({ children }) => children;

// Mock SignIn component
const SignIn = () => null;

// Mock SignUp component
const SignUp = () => null;

// Mock SignedIn component (renders nothing - user not signed in during tests)
const SignedIn = ({ children: _children }) => null;

// Mock SignedOut component (renders children - user is signed out during tests)
const SignedOut = ({ children }) => children;

// Mock UserButton component
const UserButton = () => null;

module.exports = {
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
