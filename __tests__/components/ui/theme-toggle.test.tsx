// Jest provides describe, beforeEach, it, expect globally
import { render, fireEvent, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/ui/theme/theme-toggle";

// Mock next-themes
const mockSetTheme = jest.fn();
jest.mock("next-themes", () => ({
  useTheme: jest.fn(() => ({
    theme: "system",
    setTheme: mockSetTheme,
    resolvedTheme: "light",
    systemTheme: "light",
  })),
}));

import { useTheme } from "next-themes";
const useThemeMock = useTheme as jest.Mock;

describe("ThemeToggle", () => {
  beforeEach(() => {
    // Reset mock before each test
    useThemeMock.mockClear();
    mockSetTheme.mockClear();
    // Set a default implementation for useTheme for the start of each test
    useThemeMock.mockImplementation(() => ({
      theme: "system",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
      systemTheme: "light",
    }));
  });

  it("cycles between light and dark themes correctly", () => {
    // Start with system theme resolving to light (default mock implementation)
    const { rerender } = render(<ThemeToggle />);
    const button = screen.getByRole("button");

    // System (light) -> Dark
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");

    // Update mock for dark theme using mockImplementationOnce
    useThemeMock.mockImplementationOnce(() => ({
      theme: "dark",
      setTheme: mockSetTheme,
      resolvedTheme: "dark",
      systemTheme: "light",
    }));
    rerender(<ThemeToggle />);

    // Dark -> Light
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith("light");

    // Update mock for light theme
    useThemeMock.mockImplementationOnce(() => ({
      theme: "light",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
      systemTheme: "light",
    }));
    rerender(<ThemeToggle />);

    // Light -> Dark
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("respects system theme preference for initial icon", () => {
    // System theme is dark
    useThemeMock.mockImplementationOnce(() => ({
      theme: "system",
      setTheme: mockSetTheme,
      resolvedTheme: "dark",
      systemTheme: "dark",
    }));

    render(<ThemeToggle />);

    // Should show sun icon when resolved theme is dark
    expect(screen.getByTestId("sun-icon")).toBeInTheDocument();
    // Note: We're not checking for moon-icon absence here because the hover state also renders it
  });

  it("shows correct icon based on resolved theme", () => {
    // Test light theme
    useThemeMock.mockImplementationOnce(() => ({
      theme: "light",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
      systemTheme: "light",
    }));

    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByTestId("moon-icon")).toBeInTheDocument();

    // Test dark theme
    useThemeMock.mockImplementationOnce(() => ({
      theme: "dark",
      setTheme: mockSetTheme,
      resolvedTheme: "dark",
      systemTheme: "light",
    }));

    rerender(<ThemeToggle />);
    expect(screen.getByTestId("sun-icon")).toBeInTheDocument();
  });

  it("displays correct title based on current and resolved theme", () => {
    // Test system theme (resolved light) - uses default beforeEach mock state
    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByTitle("Current theme: system (Resolved: light)")).toBeInTheDocument();

    // Test light theme
    useThemeMock.mockImplementationOnce(() => ({
      theme: "light",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
      systemTheme: "light",
    }));

    rerender(<ThemeToggle />);
    expect(screen.getByTitle("Current theme: light (Resolved: light)")).toBeInTheDocument();

    // Test dark theme
    useThemeMock.mockImplementationOnce(() => ({
      theme: "dark",
      setTheme: mockSetTheme,
      resolvedTheme: "dark",
      systemTheme: "light",
    }));

    rerender(<ThemeToggle />);
    expect(screen.getByTitle("Current theme: dark (Resolved: dark)")).toBeInTheDocument();
  });
});
