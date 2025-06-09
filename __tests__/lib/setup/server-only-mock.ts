console.log('[SETUP] Executing server-only-mock.ts');

// Mock ensure-server-only globally before any tests run
jest.mock('../../lib/utils/ensure-server-only', () => ({
  assertServerOnly: jest.fn(() => undefined)
}));