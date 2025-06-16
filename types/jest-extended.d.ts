// jest-extended custom matcher definitions

declare module "jest-extended";

declare global {
  namespace jest {
    interface Matchers<R> {
      /** Asserts the received value is a string */
      toBeString(): R;
    }
  }
}

export {};
