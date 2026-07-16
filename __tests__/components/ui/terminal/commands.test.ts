/** Terminal command behavior. */
import { handleCommand } from "@/components/ui/terminal/commands.client";
import { sections, terminalNavigationHelp } from "@/components/ui/terminal/sections";
import { isChatCommand } from "@/types/terminal";

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn<typeof globalThis.fetch>();

globalThis.fetch = mockFetch;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const mockConsoleError = vi.fn();
const mockConsoleLog = vi.fn();
Object.assign(console, { error: mockConsoleError, log: mockConsoleLog });

function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function createJsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe("Terminal Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockConsoleError.mockReset();
    mockConsoleLog.mockReset();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    Object.assign(console, { error: originalConsoleError, log: originalConsoleLog });
  });

  describe("Basic Commands", () => {
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
  });

  describe("AI Chat Commands", () => {
    it("should perform one-shot AI chat when args are provided", async () => {
      const tokenResponse = createJsonResponse({
        token: "test-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      const chatResponse = createSseResponse([
        'event: started\ndata: {"running":1,"pending":0,"maxParallel":1,"queueWaitMs":0}\n\n',
        'event: done\ndata: {"message":"Hello from the assistant."}\n\n',
      ]);

      mockFetch.mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(chatResponse);

      const result = await handleCommand("ai hello world");

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/api/ai/token",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/api/ai/chat/terminal_chat",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
            Accept: "text/event-stream",
          }),
        }),
      );

      expect(result.results).toHaveLength(2);
      const first = result.results[0];
      const second = result.results[1];
      expect(isChatCommand(first)).toBe(true);
      expect(isChatCommand(second)).toBe(true);
      if (!isChatCommand(first) || !isChatCommand(second)) {
        throw new TypeError("Expected chat command results");
      }
      expect(first.role).toBe("user");
      expect(second.role).toBe("assistant");
    });
  });

  describe("Navigation Commands", () => {
    it("navigates to every quick jump shown in help without searching", async () => {
      const help = await handleCommand("help");
      expect(help.results[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining(terminalNavigationHelp.quickJumps),
      });

      for (const [command, section] of Object.entries(sections)) {
        if (section.helpGroup !== "quick-jump") continue;
        const result = await handleCommand(command);
        expect(result.navigation).toBe(section.path);
      }

      expect(sections.techstars.path).toBe("/experience#techstars");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Section Search Commands", () => {
    it("should search in blog section", async () => {
      const mockResponse = createJsonResponse([
        {
          id: "test-1",
          type: "blog-post",
          title: "Test Post",
          description: "Test description",
          url: "/blog/test",
          score: 1,
        },
      ]);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("blog test query");

      expect(mockFetch).toHaveBeenCalledWith(
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
      mockFetch.mockRejectedValueOnce(new Error("API Error"));

      const result = await handleCommand("blog test query");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test query"'),
      });
    });

    it("should handle blog search with non-200 response", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const result = await handleCommand("blog test query");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test query"'),
      });
    });

    it("should handle no search results", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      const result = await handleCommand("blog no-results");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("No results found"),
      });
      expect(result.selectionItems).toBeUndefined();
    });

    it("should execute experience search", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      const result = await handleCommand("experience test query");
      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("No results found"),
      });
    });
  });

  describe("Site-Wide Search", () => {
    it("should perform site-wide search for unknown commands", async () => {
      const mockResponse = createJsonResponse([
        {
          id: "result-1",
          type: "page",
          title: "Result 1",
          description: "Test",
          url: "/test1",
          score: 1,
        },
        {
          id: "result-2",
          type: "page",
          title: "Result 2",
          description: "Test",
          url: "/test2",
          score: 0.9,
        },
      ]);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await handleCommand("unknown command");

      expect(mockFetch).toHaveBeenCalledWith(
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
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      const result = await handleCommand("unknown command");

      expect(mockFetch).toHaveBeenCalledWith(
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
      mockFetch.mockRejectedValueOnce(new Error("API Error"));

      const result = await handleCommand("unknown command");

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining("Command not recognized"),
      });
    });

    it("should handle unknown errors in site-wide search", async () => {
      mockFetch.mockRejectedValueOnce("Not an Error object");

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
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      await handleCommand("blog test", controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/search/blog?q=test",
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("should accept and use AbortSignal for site-wide search", async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      await handleCommand("unknown command", controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/search/all?q=unknown%20command",
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("should handle aborted requests gracefully", async () => {
      const controller = new AbortController();
      const abortError = new DOMException("Aborted", "AbortError");

      mockFetch.mockRejectedValueOnce(abortError);

      controller.abort();

      const result = await handleCommand("blog test", controller.signal);

      expect(result.results?.[0]).toMatchObject({
        type: "text",
        output: expect.stringContaining('No results found in Blog for "test"'),
      });
    });

    it("should propagate AbortSignal through all search paths", async () => {
      const controller = new AbortController();
      const mockResponse = createJsonResponse([
        {
          id: "test-1",
          type: "blog-post",
          title: "Test",
          description: "Test",
          url: "/test",
          score: 1,
        },
      ]);

      for (const [command, section] of Object.entries(sections)) {
        if (section.searchScope === null) continue;
        mockFetch.mockResolvedValueOnce(mockResponse);

        await handleCommand(`${command} test`, controller.signal);

        expect(mockFetch).toHaveBeenLastCalledWith(
          `/api/search/${section.searchScope}?q=test`,
          expect.objectContaining({ signal: controller.signal }),
        );
      }
    });
  });
});
