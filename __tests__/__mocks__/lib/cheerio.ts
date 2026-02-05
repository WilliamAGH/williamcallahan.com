/**
 * Mock for the `cheerio` library.
 * Provides only the functionality required by our tests so that
 * we can avoid loading Cheerio's ESM build.
 */

interface CheerioStub {
  html: () => string;
  text: () => string;
  find: () => CheerioStub;
  attr: () => undefined;
  root: () => CheerioStub;
}

function createStubRoot(): CheerioStub {
  const stub: CheerioStub = {
    html: () => "",
    text: () => "",
    find: () => stub,
    attr: () => undefined,
    // Allow chaining
    root: () => stub,
  };
  return stub;
}

/**
 * Mimic cheerio.load – returns a stubbed root object that supports the
 * chaining methods used in our OpenGraph parser implementation.
 */
export function load(): CheerioStub {
  return createStubRoot();
}

export default { load };
