module.exports = {
  MDXRemote: jest.fn().mockImplementation(({ children }) => children)
};