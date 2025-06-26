/**
 * Mock for next/navigation
 */
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
};

const mockSearchParams = {
  get: jest.fn(),
  has: jest.fn(),
  getAll: jest.fn(),
  keys: jest.fn(),
  values: jest.fn(),
  entries: jest.fn(),
  toString: jest.fn(),
};

export const useRouter = jest.fn(() => mockRouter);
export const useSearchParams = jest.fn(() => mockSearchParams);
export const usePathname = jest.fn(() => "/");
export const useParams = jest.fn(() => ({}));
export const redirect = jest.fn();
export const notFound = jest.fn();
