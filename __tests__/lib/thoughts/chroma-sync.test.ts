/**
 * @file Unit tests for Thoughts Chroma sync operations
 * Tests the sync functionality between Thoughts primary store and Chroma vector store.
 * Focuses on functional regression testing - ensuring operations accept correct inputs
 * and produce expected outputs.
 * @module __tests__/lib/thoughts/chroma-sync.test
 */

import type { Thought } from "@/types/schemas/thought";

// Shared mock collection - use getMockCollection() to access
let mockCollection: {
  upsert: jest.Mock;
  add: jest.Mock;
  delete: jest.Mock;
  get: jest.Mock;
  count: jest.Mock;
};

// Initialize mock collection with defaults
function initMockCollection() {
  mockCollection = {
    upsert: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ ids: [], embeddings: [], metadatas: [], documents: [] }),
    count: jest.fn().mockResolvedValue(0),
  };
}

// Initialize before mocking
initMockCollection();

// Mock chromadb - reference mockCollection via closure so it gets current value
jest.mock("chromadb", () => ({
  CloudClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockImplementation(() => Promise.resolve(mockCollection)),
  })),
}));

// Valid test thought for reuse
const createTestThought = (overrides: Partial<Thought> = {}): Thought => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "test-thought",
  title: "Test Thought Title",
  content: "This is the test thought content.",
  createdAt: "2024-01-15T10:30:00.000Z",
  ...overrides,
});

describe("Thoughts Chroma Sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Re-initialize mock collection with fresh mocks
    initMockCollection();
  });

  describe("getThoughtsCollection", () => {
    it("should return a collection with correct configuration", async () => {
      const { getThoughtsCollection } = await import("@/lib/thoughts/chroma-sync");
      const collection = await getThoughtsCollection();

      expect(collection).toBeDefined();
      expect(collection).toHaveProperty("upsert");
      expect(collection).toHaveProperty("add");
      expect(collection).toHaveProperty("delete");
    });
  });

  describe("syncThoughtToChroma", () => {
    it("should sync a thought with all fields", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought({
        category: "testing",
        tags: ["jest", "unit-test"],
        updatedAt: "2024-01-16T10:30:00.000Z",
        draft: false,
      });

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: [thought.id],
        documents: [`${thought.title}\n\n${thought.content}`],
        metadatas: [
          expect.objectContaining({
            slug: thought.slug,
            title: thought.title,
            category: "testing",
            tags: "jest,unit-test",
            createdAt: thought.createdAt,
            updatedAt: thought.updatedAt,
            draft: false,
            contentType: "thought",
          }),
        ],
      });
    });

    it("should handle thought with minimal fields (optional fields undefined)", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought();

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: [thought.id],
        documents: [`${thought.title}\n\n${thought.content}`],
        metadatas: [
          expect.objectContaining({
            slug: thought.slug,
            title: thought.title,
            category: "", // Empty string for undefined
            tags: "", // Empty string for undefined
            createdAt: thought.createdAt,
            updatedAt: thought.createdAt, // Falls back to createdAt
            draft: false, // Default false
            contentType: "thought",
          }),
        ],
      });
    });

    it("should handle draft thoughts", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought({ draft: true });

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [expect.objectContaining({ draft: true })],
        }),
      );
    });
  });

  describe("syncThoughtsToChroma", () => {
    it("should handle empty array gracefully", async () => {
      const { syncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");

      await syncThoughtsToChroma([]);

      expect(mockCollection.upsert).not.toHaveBeenCalled();
    });

    it("should sync multiple thoughts in batch", async () => {
      const { syncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thoughts = [
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440001", slug: "thought-1" }),
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440002", slug: "thought-2" }),
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440003", slug: "thought-3" }),
      ];

      await syncThoughtsToChroma(thoughts);

      expect(mockCollection.upsert).toHaveBeenCalledTimes(1);
      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: thoughts.map(t => t.id),
        documents: thoughts.map(t => `${t.title}\n\n${t.content}`),
        metadatas: expect.arrayContaining([
          expect.objectContaining({ slug: "thought-1" }),
          expect.objectContaining({ slug: "thought-2" }),
          expect.objectContaining({ slug: "thought-3" }),
        ]),
      });
    });
  });

  describe("removeThoughtFromChroma", () => {
    it("should remove a thought by ID", async () => {
      const { removeThoughtFromChroma } = await import("@/lib/thoughts/chroma-sync");
      const thoughtId = "550e8400-e29b-41d4-a716-446655440000";

      await removeThoughtFromChroma(thoughtId);

      expect(mockCollection.delete).toHaveBeenCalledWith({ ids: [thoughtId] });
    });
  });

  describe("removeThoughtsFromChroma", () => {
    it("should handle empty array gracefully", async () => {
      const { removeThoughtsFromChroma } = await import("@/lib/thoughts/chroma-sync");

      await removeThoughtsFromChroma([]);

      expect(mockCollection.delete).not.toHaveBeenCalled();
    });

    it("should remove multiple thoughts in batch", async () => {
      const { removeThoughtsFromChroma } = await import("@/lib/thoughts/chroma-sync");
      const ids = ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"];

      await removeThoughtsFromChroma(ids);

      expect(mockCollection.delete).toHaveBeenCalledWith({ ids });
    });
  });

  describe("fullSyncThoughtsToChroma", () => {
    it("should return correct counts when no thoughts provided", async () => {
      const { fullSyncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");

      const result = await fullSyncThoughtsToChroma([]);

      expect(result).toEqual({ synced: 0, skipped: 0 });
    });

    it("should skip draft thoughts by default", async () => {
      const { fullSyncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thoughts = [
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440001", draft: false }),
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440002", draft: true }),
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440003", draft: false }),
      ];

      const result = await fullSyncThoughtsToChroma(thoughts);

      expect(result).toEqual({ synced: 2, skipped: 1 });
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440003"],
        }),
      );
    });

    it("should include drafts when includeDrafts option is true", async () => {
      const { fullSyncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thoughts = [
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440001", draft: false }),
        createTestThought({ id: "550e8400-e29b-41d4-a716-446655440002", draft: true }),
      ];

      const result = await fullSyncThoughtsToChroma(thoughts, { includeDrafts: true });

      expect(result).toEqual({ synced: 2, skipped: 0 });
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"],
        }),
      );
    });

    it("should clear existing documents before adding new ones", async () => {
      const { fullSyncThoughtsToChroma } = await import("@/lib/thoughts/chroma-sync");

      // Simulate existing documents in collection
      mockCollection.get
        .mockResolvedValueOnce({ ids: ["existing-1", "existing-2"], embeddings: [], metadatas: [], documents: [] })
        .mockResolvedValueOnce({ ids: [], embeddings: [], metadatas: [], documents: [] });

      const thoughts = [createTestThought()];
      await fullSyncThoughtsToChroma(thoughts);

      // Should delete existing before adding new
      expect(mockCollection.delete).toHaveBeenCalledWith({ ids: ["existing-1", "existing-2"] });
      expect(mockCollection.add).toHaveBeenCalled();
    });
  });

  describe("getThoughtsChromaCount", () => {
    it("should return the collection count", async () => {
      const { getThoughtsChromaCount } = await import("@/lib/thoughts/chroma-sync");
      mockCollection.count.mockResolvedValue(42);

      const count = await getThoughtsChromaCount();

      expect(count).toBe(42);
      expect(mockCollection.count).toHaveBeenCalled();
    });
  });

  describe("thoughtExistsInChroma", () => {
    it("should return true when thought exists", async () => {
      const thoughtId = "550e8400-e29b-41d4-a716-446655440000";
      // Set up mock to return a non-empty result
      mockCollection.get.mockResolvedValue({
        ids: [thoughtId],
        embeddings: [],
        metadatas: [{}],
        documents: [],
      });

      const { thoughtExistsInChroma } = await import("@/lib/thoughts/chroma-sync");
      const exists = await thoughtExistsInChroma(thoughtId);

      expect(exists).toBe(true);
      expect(mockCollection.get).toHaveBeenCalledWith({ ids: [thoughtId] });
    });

    it("should return false when thought does not exist", async () => {
      // Default mock returns empty ids, which is what we need
      const { thoughtExistsInChroma } = await import("@/lib/thoughts/chroma-sync");
      const thoughtId = "550e8400-e29b-41d4-a716-446655440000";

      const exists = await thoughtExistsInChroma(thoughtId);

      expect(exists).toBe(false);
    });
  });

  describe("Metadata Conversion", () => {
    it("should convert tags array to comma-separated string", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought({
        tags: ["javascript", "testing", "jest"],
      });

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [expect.objectContaining({ tags: "javascript,testing,jest" })],
        }),
      );
    });

    it("should use empty string for undefined optional fields", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought({
        category: undefined,
        tags: undefined,
      });

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [
            expect.objectContaining({
              category: "",
              tags: "",
            }),
          ],
        }),
      );
    });

    it("should always include contentType as 'thought'", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought();

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [expect.objectContaining({ contentType: "thought" })],
        }),
      );
    });
  });

  describe("Document Text Generation", () => {
    it("should combine title and content with double newline separator", async () => {
      const { syncThoughtToChroma } = await import("@/lib/thoughts/chroma-sync");
      const thought = createTestThought({
        title: "My Title",
        content: "My content goes here.",
      });

      await syncThoughtToChroma(thought);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          documents: ["My Title\n\nMy content goes here."],
        }),
      );
    });
  });
});
