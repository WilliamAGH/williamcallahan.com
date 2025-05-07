import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Register Happy DOM global environment for Bun tests
GlobalRegistrator.register();

// Polyfill clipboard API with a stub for writeText so tests can override it
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: async (_text: string) => Promise.resolve(),
  },
  writable: true,
  configurable: true,
});
