/**
 * Tag Ontology System
 *
 * Defines semantic relationships between tags across different content types
 * to enable cross-content discovery even when exact tag matches don't exist.
 */

/**
 * Semantic tag groups - tags within each group are considered related
 */
export const TAG_ONTOLOGY = {
  // AI and Machine Learning
  AI_CONCEPTS: [
    "ai",
    "ml",
    "machine learning",
    "ai / ml",
    "artificial intelligence",
    "openai",
    "gpt",
    "llm",
    "claude",
    "gemini",
    "anthropic",
    "neural networks",
    "deep learning",
    "nlp",
    "natural language processing",
    "ai development tools",
    "ai agents",
    "rag",
    "embeddings",
    "transformers",
    "generative ai",
    "predictive analytics",
  ],

  // Venture Capital and Investing
  VENTURE_CONCEPTS: [
    "venture capital",
    "vc",
    "investing",
    "investment",
    "startups",
    "series a",
    "series b",
    "series c",
    "seed",
    "seed+",
    "pre-seed",
    "funding",
    "fundraising",
    "portfolio",
    "angel investing",
    "accelerator",
    "incubator",
    "techstars",
    "y combinator",
    "investment platforms",
    "venture",
    "capital",
    "equity",
  ],

  // Web Development Technologies
  WEB_TECH: [
    "react",
    "nextjs",
    "next.js",
    "vue",
    "angular",
    "svelte",
    "javascript",
    "typescript",
    "html",
    "css",
    "tailwind",
    "tailwind css",
    "frontend",
    "web app",
    "spa",
    "pwa",
    "web development",
    "responsive design",
    "ui/ux",
    "web components",
    "jsx",
    "tsx",
  ],

  // Backend and APIs
  BACKEND_TECH: [
    "node.js",
    "nodejs",
    "express",
    "fastify",
    "nestjs",
    "python",
    "django",
    "flask",
    "fastapi",
    "java",
    "spring",
    "spring boot",
    "kotlin",
    "go",
    "golang",
    "rust",
    "ruby",
    "rails",
    "api",
    "rest",
    "graphql",
    "grpc",
    "websocket",
    "microservices",
    "serverless",
    "lambda",
    "edge functions",
  ],

  // Databases and Storage
  DATA_STORAGE: [
    "database",
    "sql",
    "nosql",
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "dynamodb",
    "s3",
    "object storage",
    "cache",
    "caching",
    "data persistence",
    "orm",
    "prisma",
    "typeorm",
    "sequelize",
  ],

  // DevOps and Infrastructure
  DEVOPS: [
    "docker",
    "kubernetes",
    "k8s",
    "ci/cd",
    "github actions",
    "deployment",
    "hosting",
    "cloud",
    "aws",
    "gcp",
    "azure",
    "vercel",
    "netlify",
    "railway",
    "fly.io",
    "heroku",
    "infrastructure",
    "terraform",
    "ansible",
    "monitoring",
  ],

  // Finance and Fintech
  FINANCE: [
    "finance",
    "fintech",
    "payments",
    "banking",
    "defi",
    "cryptocurrency",
    "blockchain",
    "trading",
    "investment",
    "portfolio management",
    "risk management",
    "compliance",
    "payment processing",
    "financial services",
  ],

  // Enterprise and B2B
  ENTERPRISE: [
    "enterprise",
    "b2b",
    "saas",
    "crm",
    "erp",
    "hrm",
    "productivity",
    "collaboration",
    "workflow",
    "automation",
    "business intelligence",
    "analytics",
    "reporting",
  ],

  // Mobile Development
  MOBILE: [
    "mobile",
    "ios",
    "android",
    "react native",
    "flutter",
    "swift",
    "kotlin",
    "mobile app",
    "app development",
    "cross-platform",
    "pwa",
    "responsive",
  ],

  // Open Source
  OPEN_SOURCE: [
    "open source",
    "oss",
    "github",
    "gitlab",
    "git",
    "contributing",
    "pull request",
    "fork",
    "repository",
    "mit license",
    "apache license",
    "gpl",
    "community",
  ],

  // Security
  SECURITY: [
    "security",
    "cybersecurity",
    "encryption",
    "authentication",
    "authorization",
    "oauth",
    "jwt",
    "ssl",
    "tls",
    "https",
    "vulnerability",
    "penetration testing",
    "compliance",
    "gdpr",
  ],

  // Data Science and Analytics
  DATA_SCIENCE: [
    "data science",
    "analytics",
    "big data",
    "data engineering",
    "etl",
    "data pipeline",
    "visualization",
    "dashboard",
    "business intelligence",
    "bi",
    "reporting",
    "metrics",
  ],

  // Robotics and IoT
  ROBOTICS_IOT: [
    "robotics",
    "iot",
    "internet of things",
    "embedded systems",
    "arduino",
    "raspberry pi",
    "sensors",
    "automation",
    "industrial",
    "manufacturing",
    "hardware",
  ],

  // Transportation and Logistics
  TRANSPORTATION: [
    "transportation",
    "logistics",
    "delivery",
    "shipping",
    "autonomous vehicles",
    "electric vehicles",
    "ev",
    "mobility",
    "rideshare",
    "fleet management",
    "supply chain",
  ],

  // Healthcare and Biotech
  HEALTHCARE: [
    "healthcare",
    "health tech",
    "medical",
    "biotech",
    "telemedicine",
    "digital health",
    "wellness",
    "fitness",
    "pharmaceutical",
    "clinical",
    "patient care",
  ],

  // Education
  EDUCATION: [
    "education",
    "edtech",
    "e-learning",
    "online learning",
    "course",
    "tutorial",
    "training",
    "certification",
    "lms",
    "mooc",
    "educational",
  ],
};

/**
 * Normalize a tag for comparison (lowercase, trim, remove special chars)
 */
function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Build a reverse lookup map for efficient semantic matching
 */
function buildReverseLookup(): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>();

  for (const [, tags] of Object.entries(TAG_ONTOLOGY)) {
    const normalizedGroup = new Set(tags.map(normalizeTag));

    for (const tag of normalizedGroup) {
      if (!lookup.has(tag)) {
        lookup.set(tag, new Set());
      }
      // Add all other tags in the group as related
      for (const relatedTag of normalizedGroup) {
        if (relatedTag !== tag) {
          lookup.get(tag)?.add(relatedTag);
        }
      }
    }
  }

  return lookup;
}

// Pre-build the lookup map for performance
const SEMANTIC_LOOKUP = buildReverseLookup();

/**
 * Check if two tags are semantically related
 */
export function areTagsRelated(tag1: string, tag2: string): boolean {
  const norm1 = normalizeTag(tag1);
  const norm2 = normalizeTag(tag2);

  // Exact match
  if (norm1 === norm2) return true;

  // Check if they're in the same semantic group
  const related1 = SEMANTIC_LOOKUP.get(norm1);
  if (related1?.has(norm2)) return true;

  // Check partial matches for compound terms
  // e.g., "machine learning" matches with "ml" or "learning"
  const words1 = norm1.split(" ");
  const words2 = norm2.split(" ");

  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1.length > 2 && word2.length > 2) {
        // Check if one word contains the other
        if (word1.includes(word2) || word2.includes(word1)) {
          return true;
        }
        // Check semantic lookup for individual words
        const relatedWord = SEMANTIC_LOOKUP.get(word1);
        if (relatedWord?.has(word2)) return true;
      }
    }
  }

  return false;
}

/**
 * Calculate semantic similarity between two tag sets
 * Returns a score between 0 and 1
 */
export function calculateSemanticTagSimilarity(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 || tags2.length === 0) return 0;

  let matches = 0;
  let totalComparisons = 0;

  for (const tag1 of tags1) {
    for (const tag2 of tags2) {
      totalComparisons++;
      if (areTagsRelated(tag1, tag2)) {
        matches++;
      }
    }
  }

  // Use Jaccard-like coefficient but with semantic matches
  const score = totalComparisons > 0 ? matches / totalComparisons : 0;

  // Apply a scaling factor to prevent semantic matches from overwhelming exact matches
  // Semantic matches get 70% of the weight of exact matches
  return Math.min(1, score * 0.7);
}

/**
 * Get semantic group for a tag (for debugging/analysis)
 */
export function getSemanticGroup(tag: string): string | null {
  const normalized = normalizeTag(tag);

  for (const [group, tags] of Object.entries(TAG_ONTOLOGY)) {
    if (tags.map(normalizeTag).includes(normalized)) {
      return group;
    }
  }

  return null;
}

/**
 * Expand a tag set with semantically related tags
 * Useful for search and discovery
 */
export function expandTagsWithRelated(tags: string[], limit: number = 5): string[] {
  const expanded = new Set(tags.map(normalizeTag));
  const additions = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    const related = SEMANTIC_LOOKUP.get(normalized);

    if (related) {
      for (const relatedTag of related) {
        if (additions.size >= limit) break;
        additions.add(relatedTag);
      }
    }
  }

  return [...expanded, ...additions];
}
