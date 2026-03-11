import {
  buildEmbeddingText,
  EMBEDDING_FIELD_CONTRACTS,
  type EmbeddingFieldSpec,
} from "@/lib/db/embedding-input-contracts";
import { CONTENT_EMBEDDING_DOMAINS } from "@/types/db/embeddings";

/**
 * Words that are banned as standalone labels because they have multiple
 * common meanings. Each must be qualified (e.g. "Topic Category" not "Category").
 * Exception: a word is allowed if preceded by a qualifying word.
 */
const BANNED_STANDALONE_LABELS = ["type", "state", "stage", "domain", "content", "note", "status"];

describe("EMBEDDING_FIELD_CONTRACTS", () => {
  it("has a contract for every content embedding domain", () => {
    for (const domain of CONTENT_EMBEDDING_DOMAINS) {
      expect(EMBEDDING_FIELD_CONTRACTS[domain]).toBeDefined();
      expect(EMBEDDING_FIELD_CONTRACTS[domain].length).toBeGreaterThan(0);
    }
  });

  it("primary content domains have at least one required field", () => {
    const primaryDomains = ["bookmark", "thought", "investment", "project", "book", "blog"];
    for (const domain of primaryDomains) {
      const fields = EMBEDDING_FIELD_CONTRACTS[domain as keyof typeof EMBEDDING_FIELD_CONTRACTS];
      const requiredFields = fields.filter((f: EmbeddingFieldSpec) => f.required);
      expect(requiredFields.length).toBeGreaterThan(0, `Domain "${domain}" has no required fields`);
    }
  });

  it("verbose fields are always at the end of the field list", () => {
    for (const [domain, fields] of Object.entries(EMBEDDING_FIELD_CONTRACTS)) {
      let sawVerbose = false;
      for (const field of fields) {
        expect(sawVerbose && !field.verboseField).toBe(
          false,
          `Domain "${domain}": non-verbose field "${field.label}" appears after ` +
            `verbose field. Verbose fields must be last for truncation safety.`,
        );
        if (field.verboseField) sawVerbose = true;
      }
    }
  });

  it("no label uses a banned standalone word", () => {
    for (const [domain, fields] of Object.entries(EMBEDDING_FIELD_CONTRACTS)) {
      for (const field of fields) {
        const labelLower = field.label.toLowerCase();
        for (const banned of BANNED_STANDALONE_LABELS) {
          expect(labelLower).not.toBe(
            banned,
            `Domain "${domain}": label "${field.label}" is a banned standalone ` +
              `word. Qualify it (e.g. "Topic ${field.label}" or "Company ${field.label}").`,
          );
        }
      }
    }
  });

  it("labels are unique within each domain", () => {
    for (const [domain, fields] of Object.entries(EMBEDDING_FIELD_CONTRACTS)) {
      const labels = fields.map((f: EmbeddingFieldSpec) => f.label);
      const unique = new Set(labels);
      expect(unique.size).toBe(labels.length, `Domain "${domain}" has duplicate labels`);
    }
  });

  it("every field has a non-empty meaning", () => {
    for (const [domain, fields] of Object.entries(EMBEDDING_FIELD_CONTRACTS)) {
      for (const field of fields) {
        expect(field.meaning.trim().length).toBeGreaterThan(
          0,
          `Domain "${domain}", field "${field.label}" has empty meaning`,
        );
      }
    }
  });
});

describe("buildEmbeddingText", () => {
  const SAMPLE_FIELDS: EmbeddingFieldSpec[] = [
    {
      sourceKey: "name",
      label: "Company Name",
      meaning: "test",
      required: true,
      verboseField: false,
    },
    {
      sourceKey: "sector",
      label: "Business Sector",
      meaning: "test",
      required: false,
      verboseField: false,
    },
    {
      sourceKey: "tags",
      label: "Topic Tags",
      meaning: "test",
      required: false,
      verboseField: false,
    },
    { sourceKey: "body", label: "Full Text", meaning: "test", required: false, verboseField: true },
  ];

  it("builds text with correct labels", () => {
    const result = buildEmbeddingText(SAMPLE_FIELDS, {
      name: "Acme Corp",
      sector: "Fintech",
    });

    expect(result).toBe("Company Name: Acme Corp\nBusiness Sector: Fintech");
  });

  it("skips null and empty string values", () => {
    const result = buildEmbeddingText(SAMPLE_FIELDS, {
      name: "Acme Corp",
      sector: null,
      tags: [],
      body: "",
    });

    expect(result).toBe("Company Name: Acme Corp");
  });

  it("formats arrays as comma-separated values", () => {
    const result = buildEmbeddingText(SAMPLE_FIELDS, {
      name: "Test",
      tags: ["AI", "ML", "Data"],
    });

    expect(result).toContain("Topic Tags: AI, ML, Data");
  });

  it("formats arrays of objects with name property", () => {
    const result = buildEmbeddingText(SAMPLE_FIELDS, {
      name: "Test",
      tags: [{ name: "AI" }, { name: "ML" }],
    });

    expect(result).toContain("Topic Tags: AI, ML");
  });

  it("resolves dot-notation paths for nested objects", () => {
    const nestedFields: EmbeddingFieldSpec[] = [
      {
        sourceKey: "meta.title",
        label: "Title",
        meaning: "test",
        required: true,
        verboseField: false,
      },
      {
        sourceKey: "meta.sub.deep",
        label: "Deep",
        meaning: "test",
        required: false,
        verboseField: false,
      },
    ];

    const result = buildEmbeddingText(nestedFields, {
      meta: { title: "Hello", sub: { deep: "World" } },
    });

    expect(result).toBe("Title: Hello\nDeep: World");
  });

  it("trims string values", () => {
    const result = buildEmbeddingText(SAMPLE_FIELDS, {
      name: "  Acme Corp  ",
      sector: "  Fintech  ",
    });

    expect(result).toBe("Company Name: Acme Corp\nBusiness Sector: Fintech");
  });

  it("produces correct output for a real bookmark-like record", () => {
    const result = buildEmbeddingText(EMBEDDING_FIELD_CONTRACTS.bookmark, {
      title: "Understanding Vector Databases",
      description: "A guide to pgvector and HNSW indexes",
      summary: null,
      note: "Great reference for our migration",
      domain: "example.com",
      tags: [{ name: "databases" }, { name: "pgvector" }],
      content: { title: "Understanding Vector Databases", author: "Jane Doe" },
      url: "https://example.com/vector-db",
      scrapedContentText: null,
    });

    expect(result).toContain("Page Title: Understanding Vector Databases");
    expect(result).toContain("Page Description: A guide to pgvector");
    expect(result).toContain("Personal Annotation: Great reference");
    expect(result).toContain("Website Hostname: example.com");
    expect(result).toContain("Topic Tags: databases, pgvector");
    expect(result).toContain("Page Author: Jane Doe");
    expect(result).toContain("Bookmarked URL: https://example.com/vector-db");
    // Note: Crawled Page Title IS included even when it matches Page Title.
    // Deduplication is domain-specific logic in per-domain builders, not the generic utility.
    expect(result).toContain("Crawled Page Title: Understanding Vector Databases");
    expect(result).not.toContain("Content Summary"); // null
    expect(result).not.toContain("Scraped Page Text"); // null
  });

  it("produces correct output for a real investment-like record", () => {
    const result = buildEmbeddingText(EMBEDDING_FIELD_CONTRACTS.investment, {
      name: "Accern",
      description: "AI platform for financial services",
      category: "AI / ML",
      stage: "Series B",
      status: "Active",
      operating_status: "Operating",
      location: "New York, NY",
      type: "Direct",
      invested_year: "2022",
      accelerator: null,
    });

    expect(result).toContain("Company Name: Accern");
    expect(result).toContain("Business Sector: AI / ML");
    expect(result).toContain("Funding Round at Entry: Series B");
    expect(result).toContain("Investment Outcome: Active");
    expect(result).toContain("Company Operating State: Operating");
    expect(result).toContain("Company Headquarters: New York, NY");
    expect(result).toContain("Investment Vehicle: Direct");
    expect(result).toContain("Year of Investment: 2022");
    expect(result).not.toContain("Startup Accelerator"); // null
  });
});
