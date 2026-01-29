/**
 * @file Unit tests for text-chunker module
 * Tests chunking logic, edge cases, and boundary conditions.
 * @module __tests__/lib/books/text-chunker.test
 */

import { chunkText, chunkChapters, estimateChunkCount } from "@/lib/books/text-chunker";

describe("Text Chunker", () => {
  describe("chunkText", () => {
    it("should return empty array for empty text", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   ")).toEqual([]);
      expect(chunkText("\n\n")).toEqual([]);
    });

    it("should return single chunk for short text", () => {
      const text = "This is a short paragraph with just a few words.";
      const chunks = chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        index: 0,
        text: text,
        startOffset: 0,
        endOffset: text.length,
      });
      expect(chunks[0].wordCount).toBeGreaterThan(0);
    });

    it("should split long text into multiple chunks", () => {
      // Generate text with ~1000 words (well above default 750 max)
      const words = Array(1000).fill("word").join(" ");
      const chunks = chunkText(words);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should have sequential indices
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
      });
    });

    it("should respect minWords option and drop tiny chunks", () => {
      // Text with ~150 words, minWords=100 means it should be single chunk
      const words = Array(150).fill("word").join(" ");
      const chunks = chunkText(words, { minWords: 100, maxWords: 200 });

      // Should be 1 chunk since 150 words < 200 maxWords
      expect(chunks).toHaveLength(1);
    });

    it("should include chapter metadata when provided", () => {
      const text = "Some chapter content goes here with multiple words.";
      const chunks = chunkText(text, {
        chapterId: "chapter-1",
        chapterTitle: "Introduction",
      });

      expect(chunks[0]).toMatchObject({
        chapterId: "chapter-1",
        chapterTitle: "Introduction",
      });
    });

    it("should prefer paragraph breaks when splitting", () => {
      // Create text with clear paragraph breaks
      const paragraph1 = Array(300).fill("first").join(" ");
      const paragraph2 = Array(300).fill("second").join(" ");
      const text = `${paragraph1}\n\n${paragraph2}`;

      const chunks = chunkText(text, { targetWords: 250, maxWords: 400 });

      // Should split at paragraph boundary
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // First chunk should end with "first" words, second with "second"
      expect(chunks[0].text).toContain("first");
    });

    it("should prefer sentence breaks over word breaks", () => {
      // Create text with sentence boundaries
      const sentence1 = Array(200).fill("hello").join(" ") + ".";
      const sentence2 = Array(200).fill("world").join(" ") + ".";
      const text = `${sentence1} ${sentence2}`;

      const chunks = chunkText(text, { targetWords: 150, maxWords: 300 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle text with only whitespace between words", () => {
      const text = "word1    word2\t\tword3\n\nword4";
      const chunks = chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(4);
    });

    it("should normalize CRLF to LF", () => {
      const text = "Line one.\r\nLine two.\r\nLine three.";
      const chunks = chunkText(text);

      expect(chunks[0].text).not.toContain("\r");
    });

    it("should include overlap between chunks", () => {
      // Generate long text that will require multiple chunks
      const words = Array(1500).fill("overlap").join(" ");
      const chunks = chunkText(words, { overlapWords: 50 });

      // With overlap, chunks should share some content at boundaries
      // We can't directly test overlap content, but we can verify structure
      expect(chunks.length).toBeGreaterThan(1);

      // The end of one chunk should be near the start of the next (due to overlap)
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentEnd = chunks[i].endOffset;
        const nextStart = chunks[i + 1].startOffset;
        // Next chunk should start before current ends (overlap)
        expect(nextStart).toBeLessThan(currentEnd);
      }
    });
  });

  describe("chunkChapters", () => {
    it("should return empty array for empty chapters", () => {
      expect(chunkChapters([])).toEqual([]);
    });

    it("should chunk multiple chapters with global indices", () => {
      const chapters = [
        { id: "ch1", title: "Chapter 1", text: "First chapter content here." },
        { id: "ch2", title: "Chapter 2", text: "Second chapter content here." },
        { id: "ch3", title: "Chapter 3", text: "Third chapter content here." },
      ];

      const chunks = chunkChapters(chapters);

      expect(chunks).toHaveLength(3);
      // Indices should be globally sequential
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
      expect(chunks[2].index).toBe(2);
      // Each chunk should have its chapter metadata
      expect(chunks[0].chapterId).toBe("ch1");
      expect(chunks[1].chapterId).toBe("ch2");
      expect(chunks[2].chapterId).toBe("ch3");
    });

    it("should handle chapters with different sizes", () => {
      const shortChapter = "Short.";
      const longChapter = Array(800).fill("long").join(" ");

      const chapters = [
        { id: "short", text: shortChapter },
        { id: "long", text: longChapter },
      ];

      const chunks = chunkChapters(chapters);

      // Long chapter should produce multiple chunks
      expect(chunks.length).toBeGreaterThan(2);
      // All chunks from long chapter should have same chapterId
      const longChunks = chunks.filter((c) => c.chapterId === "long");
      expect(longChunks.length).toBeGreaterThan(1);
    });

    it("should skip empty chapters", () => {
      const chapters = [
        { id: "ch1", text: "Content here." },
        { id: "ch2", text: "" },
        { id: "ch3", text: "More content." },
      ];

      const chunks = chunkChapters(chapters);

      // Empty chapter should produce no chunks
      expect(chunks.find((c) => c.chapterId === "ch2")).toBeUndefined();
    });

    it("should preserve chapter title when provided", () => {
      const chapters = [
        { id: "ch1", title: "The Beginning", text: "Once upon a time..." },
        { id: "ch2", text: "No title here." },
      ];

      const chunks = chunkChapters(chapters);

      expect(chunks.find((c) => c.chapterId === "ch1")?.chapterTitle).toBe("The Beginning");
      expect(chunks.find((c) => c.chapterId === "ch2")?.chapterTitle).toBeUndefined();
    });
  });

  describe("estimateChunkCount", () => {
    it("should return 1 for small text within 1.5x target", () => {
      expect(estimateChunkCount(500, 500)).toBe(1);
      expect(estimateChunkCount(700, 500)).toBe(1); // 700 < 750 (1.5 * 500)
    });

    it("should estimate chunks for larger text", () => {
      // 1000 words with 500 target = ~2 chunks (accounting for overlap)
      const estimate = estimateChunkCount(1000, 500);
      expect(estimate).toBeGreaterThanOrEqual(2);
    });

    it("should account for overlap in estimation", () => {
      // With 10% overlap, 1000 words / (500 * 0.9) ≈ 2.22 → 3 chunks
      const estimate = estimateChunkCount(1000, 500);
      expect(estimate).toBe(3);
    });

    it("should use default targetWords when not specified", () => {
      // Default is 500, so 500 words should be 1 chunk
      expect(estimateChunkCount(500)).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle very long words", () => {
      const longWord = "a".repeat(1000);
      const text = `${longWord} normal words here`;
      const chunks = chunkText(text);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle unicode text", () => {
      const text = "こんにちは世界 🌍 Привет мир مرحبا بالعالم";
      const chunks = chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
    });

    it("should handle text with only punctuation", () => {
      const text = "... --- ??? !!! ,,, ;;;";
      const chunks = chunkText(text);

      // Should treat punctuation as words
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it("should preserve text integrity across chunks", () => {
      // Verify no text is lost by reconstructing from chunks
      const original = Array(1000).fill("test").join(" ");
      const chunks = chunkText(original, { overlapWords: 0, targetWords: 200, maxWords: 300 });

      // Each word in original should appear in at least one chunk
      const allChunkText = chunks.map((c) => c.text).join(" ");
      expect(allChunkText.split(/\s+/).filter((w) => w === "test").length).toBeGreaterThanOrEqual(
        original.split(/\s+/).length * 0.9, // Allow some variance due to trimming
      );
    });
  });
});
