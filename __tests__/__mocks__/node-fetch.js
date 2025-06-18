// Mock for node-fetch to avoid ES module issues in Jest
module.exports = {
  __esModule: true,
  default: jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: {
        get: () => null,
      },
    }),
  ),
};
