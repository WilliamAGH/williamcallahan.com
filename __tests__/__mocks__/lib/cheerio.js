// Lightweight Jest mock for the `cheerio` library.
// Provides only the functionality required by our tests so that
// we can avoid loading Cheerio's ESM build (which Jest struggles with).

function createStubRoot() {
  const stub = {
    html: () => "",
    text: () => "",
    find: () => stub,
    attr: () => undefined,
    // Allow chaining
    root: () => stub,
  };
  return stub;
}

module.exports = {
  /**
   * Mimic cheerio.load – returns a stubbed root object that supports the
   * chaining methods used in our OpenGraph parser implementation.
   */
  load() {
    return createStubRoot();
  },
};
