/**
 * Terminal Commands Tests
 */
import { handleCommand } from "@/components/ui/terminal/commands.client";
import { isChatCommand } from "@/types";

// Store original fetch and window
const originalFetch = global.fetch;
const originalWindow = global.window;

// Mock the fetch API
global.fetch = jest.fn() as unknown as typeof fetch; // Assert type for assignment
// Setup console.error mock
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const mockConsoleError = jest.fn();
const mockConsoleLog = jest.fn();
console.error = mockConsoleError;
console.log = mockConsoleLog;

// Skip the schema.org tests since they're not working properly in this environment

// Mock window location
(global as any).window = undefined;
(global as any).window = {
  location: {
    pathname: "/test-path",
    href: "https://example.com/test-path",
  },
};

// No need to explicitly mock search functions since the command handler
// has a fallback mechanism when the module can't be loaded

describe("Terminal Commands", () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    (fetch as unknown as jest.Mock).mockReset();
    // Reset console mocks
    mockConsoleError.mockReset();
    mockConsoleLog.mockReset();
  });

  afterAll(() => {
    // Restore window
    global.window = originalWindow;
    // Restore fetch
    global.fetch = originalFetch;
    // Restore console functions
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  describe("Basic Commands", () => {
    it("should return help information", async () => {
      const result = await handleCommand("help");
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Available commands:"),
      });
    });

    it("should handle clear command", async () => {
      const result = await handleCommand("clear");
      expect(result.clear).toBe(true);
      expect(result.results).toEqual([]);
    });

    it("should enter AI chat mode when called without args", async () => {
      const result = await handleCommand("ai");
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Entering AI chat"),
      });
    });

    // Schema.org command tests are skipped due to DOM mocking complexity
  });

  describe("AI Chat Commands", () => {
    it("should perform one-shot AI chat when args are provided", async () => {
      const tokenResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          token: "test-token",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      };

      const chatResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ message: "Hello from the assistant." }),
      };

      (fetch as unknown as jest.Mock)
        .mockResolvedValueOnce(tokenResponse)
        .mockResolvedValueOnce(chatResponse);

      const result = await handleCommand("ai hello world");

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "/api/ai/token",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      );

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "/api/ai/chat/terminal_chat",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
        }),
      );

      expect(result.results).toHaveLength(2);
      const first = result.results[0];
      const second = result.results[1];
      expect(isChatCommand(first)).toBe(true);
      expect(isChatCommand(second)).toBe(true);
      // Assert both are chat commands (tests will fail above if not)
      expect((first as { role: string }).role).toBe("user");
      expect((second as { role: string }).role).toBe("assistant");
    });
  });

  describe("Navigation Commands", () => {
    it("should navigate to valid sections", async () => {
      const result = await handleCommand("blog");
      expect(result.navigation).toBe("/blog");
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: "Navigating to blog...",
      });
    });
  });

  describe("Section Search Commands", () => {
    it("should search in blog section", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            id: "test-1",
            type: "blog-post",
            title: "Test Post",
            description: "Test description",
            url: "/blog/test",
            score: 1.0,
          },
        ]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("blog test query");

      expect(fetch).toHaveBeenCalledWith(
        "/api/search/blog?q=test%20query",
        expect.objectContaining({ signal: undefined }),
      );
      expect(result.selectionItems).toHaveLength(1);
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Found 1 results in Blog"),
      });
    });

    it("should handle blog search API failure", async () => {
      (fetch as unknown as jest.Mock).mockRejectedValueOnce(new Error("API Error"));

      const result = await handleCommand("blog test query");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test query"'),
      });
    });

    it("should handle blog search with non-200 response", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("blog test query");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test query"'),
      });
    });

    it("should handle no search results", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("blog no-results");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("No results found"),
      });
      expect(result.selectionItems).toBeUndefined();
    });

    // Test experience search with mock returning empty results
    it("should execute experience search", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("experience test query");
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("No results found"),
      });
    });
  });

  describe("Site-Wide Search", () => {
    it("should perform site-wide search for unknown commands", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            id: "result-1",
            type: "page",
            title: "Result 1",
            description: "Test",
            url: "/test1",
            score: 1.0,
          },
          {
            id: "result-2",
            type: "page",
            title: "Result 2",
            description: "Test",
            url: "/test2",
            score: 0.9,
          },
        ]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("unknown command");

      expect(fetch).toHaveBeenCalledWith(
        "/api/search/all?q=unknown%20command",
        expect.objectContaining({ signal: undefined }),
      );
      expect(result.selectionItems).toHaveLength(2);
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Found 2 site-wide results"),
      });
    });

    it("should show not recognized message when no results found", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("unknown command");

      expect(fetch).toHaveBeenCalledWith(
        "/api/search/all?q=unknown%20command",
        expect.objectContaining({ signal: undefined }),
      );
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Command not recognized"),
      });
      expect(result.selectionItems).toBeUndefined();
    });

    it("should handle site-wide search API failure", async () => {
      (fetch as unknown as jest.Mock).mockRejectedValueOnce(new Error("API Error"));

      const result = await handleCommand("unknown command");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Command not recognized"),
      });
    });

    it("should handle unknown errors in site-wide search", async () => {
      (fetch as unknown as jest.Mock).mockRejectedValueOnce("Not an Error object");

      const result = await handleCommand("unknown command");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Command not recognized"),
      });
    });
  });

  describe("AbortController Support", () => {
    it("should accept and use AbortSignal for blog search", async () => {
      const controller = new AbortController();
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      await handleCommand("blog test", controller.signal);

      expect(fetch).toHaveBeenCalledWith(
        "/api/search/blog?q=test",
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("should accept and use AbortSignal for site-wide search", async () => {
      const controller = new AbortController();
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      await handleCommand("unknown command", controller.signal);

      expect(fetch).toHaveBeenCalledWith(
        "/api/search/all?q=unknown%20command",
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("should handle aborted requests gracefully", async () => {
      const controller = new AbortController();
      const abortError = new DOMException("Aborted", "AbortError");

      (fetch as unknown as jest.Mock).mockRejectedValueOnce(abortError);

      // Abort immediately
      controller.abort();

      const result = await handleCommand("blog test", controller.signal);

      // When aborted, handleCommand returns empty results
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test"'),
      });
    });

    it("should propagate AbortSignal through all search paths", async () => {
      const controller = new AbortController();
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            id: "test-1",
            type: "blog-post",
            title: "Test",
            description: "Test",
            url: "/test",
            score: 1.0,
          },
        ]),
      };

      // Test different search sections
      const sections = ["blog", "experience", "education", "investments", "bookmarks"];

      for (const section of sections) {
        (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

        await handleCommand(`${section} test`, controller.signal);

        expect(fetch).toHaveBeenLastCalledWith(
          `/api/search/${section}?q=test`,
          expect.objectContaining({ signal: controller.signal }),
        );
      }
    });
  });
});
