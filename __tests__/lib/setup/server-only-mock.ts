import { mock, jest } from 'bun:test';

console.log('[SETUP] Executing server-only-mock.ts');

// Mock ensure-server-only globally before any tests run
mock.module('../../lib/utils/ensure-server-only', () => ({
  assertServerOnly: jest.fn(() => undefined)
}));