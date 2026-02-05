/**
 * Mock for next/navigation
 */
import { vi } from "vitest";

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

const mockSearchParams = {
  get: vi.fn(),
  has: vi.fn(),
  getAll: vi.fn(),
  keys: vi.fn(),
  values: vi.fn(),
  entries: vi.fn(),
  toString: vi.fn(),
};

export const useRouter = vi.fn(() => mockRouter);
export const useSearchParams = vi.fn(() => mockSearchParams);
export const usePathname = vi.fn(() => "/");
export const useParams = vi.fn(() => ({}));
export const redirect = vi.fn();
export const notFound = vi.fn();
