/**
 * Mock for next-themes
 */
const React = require("react");
void React; // Explicitly mark as intentionally unused

module.exports = {
  useTheme: () => ({
    theme: "light",
    setTheme: jest.fn(),
    resolvedTheme: "light",
    themes: ["light", "dark"],
    systemTheme: "light",
    forcedTheme: undefined,
  }),
  ThemeProvider: ({ children }) => children,
};
