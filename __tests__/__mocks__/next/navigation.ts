/**
 * Mock for next/navigation
 */
import { vi } from "vitest";
import type * as NextNavigation from "next/navigation";

type AppRouterInstance = ReturnType<typeof NextNavigation.useRouter>;

const mockRouter = {
  push: vi.fn<AppRouterInstance["push"]>(),
  replace: vi.fn<AppRouterInstance["replace"]>(),
  prefetch: vi.fn<AppRouterInstance["prefetch"]>(),
  back: vi.fn<AppRouterInstance["back"]>(),
  forward: vi.fn<AppRouterInstance["forward"]>(),
  refresh: vi.fn<AppRouterInstance["refresh"]>(),
  bfcacheId: "mock-bfcache-id",
};

const mockSearchParams = {
  get: vi.fn<URLSearchParams["get"]>(),
  has: vi.fn<URLSearchParams["has"]>(),
  getAll: vi.fn<URLSearchParams["getAll"]>(),
  keys: vi.fn<URLSearchParams["keys"]>(),
  values: vi.fn<URLSearchParams["values"]>(),
  entries: vi.fn<URLSearchParams["entries"]>(),
  toString: vi.fn<URLSearchParams["toString"]>(),
};

export const useRouter = vi.fn<typeof NextNavigation.useRouter>(() => mockRouter);
export const useSearchParams = vi.fn<() => typeof mockSearchParams>(() => mockSearchParams);
export const usePathname = vi.fn<typeof NextNavigation.usePathname>(() => "/");
export const useParams = vi.fn<() => ReturnType<typeof NextNavigation.useParams>>(() => ({}));
export const redirect = vi.fn<typeof NextNavigation.redirect>();
export const permanentRedirect = vi.fn<typeof NextNavigation.permanentRedirect>();
export const notFound = vi.fn<typeof NextNavigation.notFound>();
