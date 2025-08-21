// Mock for @sentry/nextjs in Jest tests
module.exports = {
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  configureScope: jest.fn(),
  init: jest.fn(),
  getCurrentHub: jest.fn(() => ({
    getClient: jest.fn(() => ({
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    })),
  })),
  withScope: jest.fn(callback =>
    callback({
      setTag: jest.fn(),
      setLevel: jest.fn(),
      setContext: jest.fn(),
    }),
  ),
};
