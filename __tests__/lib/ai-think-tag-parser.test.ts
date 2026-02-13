import {
  createThinkTagParser,
  stripThinkTags,
  stripHarmonyTokens,
  sanitizeModelOutput,
} from "@/lib/ai/openai-compatible/think-tag-parser";

describe("think-tag-parser", () => {
  describe("createThinkTagParser", () => {
    it("routes content outside <think> tags to onContent", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("Hello world");
      parser.end();

      expect(content.join("")).toBe("Hello world");
      expect(thinking.join("")).toBe("");
    });

    it("routes text inside <think> tags to onThinking", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("<think>reasoning here</think>visible text");
      parser.end();

      expect(thinking.join("")).toBe("reasoning here");
      expect(content.join("")).toBe("visible text");
    });

    it("handles <think> tag split across multiple chunks", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("<thi");
      parser.push("nk>inside thinking</thi");
      parser.push("nk>after");
      parser.end();

      expect(thinking.join("")).toBe("inside thinking");
      expect(content.join("")).toBe("after");
    });

    it("handles think tags arriving one character at a time", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      const input = "<think>thought</think>response";
      for (const char of input) {
        parser.push(char);
      }
      parser.end();

      expect(thinking.join("")).toBe("thought");
      expect(content.join("")).toBe("response");
    });

    it("handles multiple think blocks", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("<think>first</think>middle<think>second</think>end");
      parser.end();

      expect(thinking.join("")).toBe("firstsecond");
      expect(content.join("")).toBe("middleend");
    });

    it("handles think block at the very start of stream", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("<think>I need to analyze this bookmark</think>");
      parser.push('{"summary":"test"}');
      parser.end();

      expect(thinking.join("")).toBe("I need to analyze this bookmark");
      expect(content.join("")).toBe('{"summary":"test"}');
    });

    it("flushes partial tag buffer as literal text on end()", () => {
      const content: string[] = [];
      const thinking: string[] = [];
      const parser = createThinkTagParser({
        onContent: (t) => content.push(t),
        onThinking: (t) => thinking.push(t),
      });

      parser.push("text<thi");
      parser.end();

      // Partial "<thi" is not a valid tag, so it becomes content
      expect(content.join("")).toBe("text<thi");
      expect(thinking.join("")).toBe("");
    });

    it("tracks isInsideThink state correctly", () => {
      const parser = createThinkTagParser({
        onContent: () => {},
        onThinking: () => {},
      });

      expect(parser.isInsideThink()).toBe(false);
      parser.push("<think>reasoning");
      expect(parser.isInsideThink()).toBe(true);
      parser.push("</think>content");
      expect(parser.isInsideThink()).toBe(false);
    });
  });

  describe("stripThinkTags", () => {
    it("removes think blocks from a completed string", () => {
      const input = "<think>reasoning</think>visible content";
      expect(stripThinkTags(input)).toBe("visible content");
    });

    it("removes multiple think blocks", () => {
      const input = "<think>a</think>x<think>b</think>y";
      expect(stripThinkTags(input)).toBe("xy");
    });

    it("handles multiline think content", () => {
      const input = "<think>\nline 1\nline 2\n</think>\nresult";
      expect(stripThinkTags(input)).toBe("result");
    });

    it("returns original text when no think tags present", () => {
      expect(stripThinkTags("plain text")).toBe("plain text");
    });

    it("handles empty think blocks", () => {
      expect(stripThinkTags("<think></think>content")).toBe("content");
    });
  });

  describe("stripHarmonyTokens", () => {
    it("strips Harmony control tokens from the first occurrence onward", () => {
      const input =
        '<|channel|>to=functions.search_tags<|channel|>commentary <|constrain|>json<|message|>{"query":"work","maxResults":5}';
      expect(stripHarmonyTokens(input)).toBe("");
    });

    it("preserves content before Harmony tokens", () => {
      const input = "Here is some content<|channel|>leaked tokens";
      expect(stripHarmonyTokens(input)).toBe("Here is some content");
    });

    it("returns original text when no Harmony tokens present", () => {
      expect(stripHarmonyTokens("plain text with no tokens")).toBe("plain text with no tokens");
    });

    it("handles empty string", () => {
      expect(stripHarmonyTokens("")).toBe("");
    });

    it("only strips <|channel|> sequences, preserves other tokens", () => {
      // <|channel|> is the definitive Harmony tool-call marker — strip it
      expect(stripHarmonyTokens("text<|channel|>leaked")).toBe("text");
      // Other <|...|> tokens may appear in legitimate content (e.g. JSON analysis)
      expect(stripHarmonyTokens("text<|end_of_turn|>more")).toBe("text<|end_of_turn|>more");
      expect(stripHarmonyTokens("text<|im_start|>system")).toBe("text<|im_start|>system");
    });
  });

  describe("sanitizeModelOutput", () => {
    it("strips both think tags and Harmony tokens", () => {
      const input = "<think>reasoning</think>visible<|channel|>leaked";
      expect(sanitizeModelOutput(input)).toBe("visible");
    });

    it("handles think tags only", () => {
      expect(sanitizeModelOutput("<think>thought</think>result")).toBe("result");
    });

    it("handles Harmony channel tokens only", () => {
      expect(sanitizeModelOutput("content<|channel|>hidden")).toBe("content");
    });

    it("returns clean text unchanged", () => {
      expect(sanitizeModelOutput("clean text")).toBe("clean text");
    });

    it("returns empty string when entire output is control tokens", () => {
      expect(sanitizeModelOutput('<|channel|>to=functions.search_tags<|message|>{"q":"x"}')).toBe(
        "",
      );
    });
  });
});
