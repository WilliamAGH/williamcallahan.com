/**
 * Keyword Extraction System
 *
 * Extracts important keywords from titles and descriptions to supplement
 * tags for better content matching and discovery.
 */

/**
 * Common English stop words to filter out
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "has",
  "have",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "with",
  "this",
  "these",
  "those",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "all",
  "would",
  "should",
  "could",
  "can",
  "may",
  "might",
  "must",
  "shall",
  "will",
  "need",
  "use",
  "used",
  "using",
  "make",
  "makes",
  "made",
  "get",
  "gets",
  "got",
  "getting",
  "we",
  "you",
  "they",
  "our",
  "your",
  "their",
  "my",
  "his",
  "her",
  "its",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "but",
  "or",
  "if",
]);

/**
 * Technical terms that are important for matching (override stop words)
 */
const TECHNICAL_TERMS = new Set([
  "ai",
  "ml",
  "api",
  "ui",
  "ux",
  "sdk",
  "cli",
  "gui",
  "ide",
  "cdn",
  "sql",
  "orm",
  "jwt",
  "ssl",
  "tls",
  "http",
  "https",
  "rest",
  "graphql",
  "ci",
  "cd",
  "k8s",
  "s3",
  "ec2",
  "vpc",
  "dns",
  "ip",
  "tcp",
  "udp",
  "css",
  "html",
  "jsx",
  "tsx",
  "xml",
  "json",
  "yaml",
  "toml",
  "b2b",
  "b2c",
  "saas",
  "paas",
  "iaas",
  "crm",
  "erp",
  "hr",
  "bi",
  "vc",
  "pe",
  "ipo",
  "m&a",
  "roi",
  "arr",
  "mrr",
  "cac",
  "ltv",
]);

/**
 * Domain-specific important terms
 */
const DOMAIN_KEYWORDS = new Set([
  // Programming languages
  "javascript",
  "typescript",
  "python",
  "java",
  "kotlin",
  "swift",
  "go",
  "rust",
  "ruby",
  "php",
  "c++",
  "c#",
  "scala",
  "elixir",
  "haskell",

  // Frameworks
  "react",
  "vue",
  "angular",
  "svelte",
  "nextjs",
  "nuxt",
  "gatsby",
  "express",
  "fastify",
  "nestjs",
  "django",
  "flask",
  "rails",
  "spring",
  "laravel",
  "symfony",
  "phoenix",
  "gin",
  "echo",
  "fiber",

  // Databases
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "elasticsearch",
  "cassandra",
  "dynamodb",
  "firestore",
  "supabase",
  "prisma",
  "typeorm",
  "sequelize",

  // Cloud/DevOps
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "jenkins",
  "github",
  "gitlab",
  "bitbucket",
  "aws",
  "azure",
  "gcp",
  "vercel",
  "netlify",

  // Business/Finance
  "startup",
  "investment",
  "funding",
  "revenue",
  "growth",
  "market",
  "platform",
  "marketplace",
  "enterprise",
  "analytics",
  "automation",

  // AI/ML
  "machine",
  "learning",
  "neural",
  "network",
  "model",
  "training",
  "inference",
  "embedding",
  "vector",
  "transformer",
  "llm",
  "chatbot",
]);

/**
 * Extract and score words from text
 */
function extractWords(text: string): Map<string, number> {
  const words = new Map<string, number>();

  // Normalize text
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");

  // Split into tokens
  const tokens = normalized.split(" ").filter((token) => token.length > 2);

  // Count word frequency
  for (const token of tokens) {
    // Skip stop words unless they're technical terms
    if (STOP_WORDS.has(token) && !TECHNICAL_TERMS.has(token)) {
      continue;
    }

    const count = words.get(token) || 0;
    words.set(token, count + 1);
  }

  return words;
}

/**
 * Calculate TF-IDF-like scores for keywords
 */
function scoreKeywords(titleWords: Map<string, number>, descWords: Map<string, number>): Map<string, number> {
  const scores = new Map<string, number>();

  // Title words get higher weight (3x)
  for (const [word, count] of titleWords) {
    scores.set(word, count * 3);
  }

  // Description words get normal weight
  for (const [word, count] of descWords) {
    const existingScore = scores.get(word) || 0;
    scores.set(word, existingScore + count);
  }

  // Boost domain-specific keywords
  for (const [word, score] of scores) {
    if (DOMAIN_KEYWORDS.has(word)) {
      scores.set(word, score * 1.5);
    }

    // Boost technical terms
    if (TECHNICAL_TERMS.has(word)) {
      scores.set(word, score * 1.3);
    }
  }

  return scores;
}

/**
 * Extract bigrams (two-word phrases) that might be important
 */
function extractBigrams(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");

  const words = normalized.split(" ").filter((w) => w.length > 1);
  const bigrams: string[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];

    if (!word1 || !word2) continue;

    // Skip if either word is a stop word (unless technical)
    if (
      (STOP_WORDS.has(word1) && !TECHNICAL_TERMS.has(word1)) ||
      (STOP_WORDS.has(word2) && !TECHNICAL_TERMS.has(word2))
    ) {
      continue;
    }

    const bigram = `${word1} ${word2}`;

    // Check if this is a known technical phrase
    const technicalPhrases = [
      "machine learning",
      "artificial intelligence",
      "venture capital",
      "series a",
      "series b",
      "web app",
      "mobile app",
      "open source",
      "real time",
      "data science",
      "big data",
      "cloud computing",
      "digital transformation",
      "user experience",
      "customer service",
    ];

    if (technicalPhrases.includes(bigram)) {
      bigrams.push(bigram);
    }
  }

  return bigrams;
}

/**
 * Main keyword extraction function
 */
export function extractKeywords(
  title: string,
  description: string,
  existingTags: string[] = [],
  limit: number = 10,
): string[] {
  // Extract words from title and description
  const titleWords = extractWords(title);
  const descWords = extractWords(description.slice(0, 500)); // Limit description length

  // Score keywords
  const scores = scoreKeywords(titleWords, descWords);

  // Extract important bigrams
  const bigrams = extractBigrams(`${title} ${description.slice(0, 200)}`);

  // Add bigrams with high score
  for (const bigram of bigrams) {
    scores.set(bigram, 10); // High score for known phrases
  }

  // Filter out existing tags to avoid duplicates
  const existingTagsNormalized = new Set(existingTags.map((tag) => tag.toLowerCase().trim()));

  for (const tag of existingTagsNormalized) {
    scores.delete(tag);
    // Also remove individual words if they're part of a tag
    const words = tag.split(" ");
    for (const word of words) {
      scores.delete(word);
    }
  }

  // Sort by score and return top keywords
  const sorted = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, _score]) => word);

  return sorted;
}

/**
 * Extract keywords optimized for cross-content matching
 */
export function extractCrossContentKeywords(
  title: string,
  description: string,
  category?: string,
  stage?: string,
): string[] {
  const keywords: string[] = [];

  // Add category and stage if provided (for investments)
  if (category) {
    keywords.push(category.toLowerCase());
  }
  if (stage) {
    keywords.push(stage.toLowerCase());
  }

  // Extract regular keywords
  const extracted = extractKeywords(title, description, keywords, 8);
  keywords.push(...extracted);

  // Extract technology mentions
  const techMatches = (title + " " + description)
    .toLowerCase()
    .match(
      /\b(react|vue|angular|nextjs|next.js|django|rails|spring|nodejs|node.js|python|java|typescript|javascript|golang|rust)\b/gi,
    );
  if (techMatches) {
    keywords.push(...techMatches.map((t) => t.toLowerCase()));
  }

  // Extract business terms
  const businessMatches = (title + " " + description)
    .toLowerCase()
    .match(/\b(startup|saas|b2b|b2c|marketplace|platform|fintech|edtech|healthtech|enterprise|sme)\b/gi);
  if (businessMatches) {
    keywords.push(...businessMatches.map((t) => t.toLowerCase()));
  }

  // Remove duplicates and return
  return [...new Set(keywords)];
}

/**
 * Check if text contains investment/VC related content
 */
export function hasInvestmentContext(text: string): boolean {
  const investmentTerms = [
    "invest",
    "funding",
    "venture",
    "capital",
    "seed",
    "startup",
    "portfolio",
    "equity",
    "valuation",
    "raise",
    "round",
  ];

  const lowercased = text.toLowerCase();
  if (investmentTerms.some((term) => lowercased.includes(term))) {
    return true;
  }

  // Check for "series [a-d]" pattern to avoid false positives like "time series"
  return /\bseries\s+[a-d]\b/.test(lowercased);
}

/**
 * Check if text contains technical/programming content
 */
export function hasTechnicalContext(text: string): boolean {
  const techTerms = [
    "code",
    "programming",
    "developer",
    "software",
    "api",
    "framework",
    "library",
    "database",
    "server",
    "frontend",
    "backend",
    "fullstack",
  ];

  const lowercased = text.toLowerCase();
  return techTerms.some((term) => lowercased.includes(term));
}
