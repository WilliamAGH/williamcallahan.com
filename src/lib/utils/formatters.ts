/**
 * String Formatting Utilities
 */

/**
 * Converts a string to kebab-case.
 * Example: "San Francisco" -> "san-francisco"
 * @param {string} str The input string.
 * @returns {string} The kebab-cased string.
 */
export const kebabCase = (str: string): string =>
  str
    ?.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    ?.map((x) => x.toLowerCase())
    ?.join("-") || "";

/**
 * Converts a kebab-case slug back into a readable title-cased string.
 * Example: "san-francisco" -> "San Francisco"
 * @param {string} slug The input kebab-case slug.
 * @returns {string} The deslugified, title-cased string.
 */
export const deslugify = (slug: string): string =>
  slug
    ?.split("-")
    ?.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    ?.join(" ") || "";

/**
 * Removes citation brackets like [1] [2] [3] from text.
 * Example: "This is a fact[1] with citations[2]." -> "This is a fact with citations."
 * @param {string} text The input text with citations.
 * @returns {string} The text with citations removed.
 */
export const removeCitations = (text: string): string => {
  if (!text) return "";
  // Remove [number] patterns (including multiple digits) and clean up extra spaces
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Formats text with paragraph breaks.
 * First sentence gets its own paragraph, then every 2 sentences after that.
 * @param {string} text The input text.
 * @param {number} sentencesPerParagraph Number of sentences per paragraph after the first (default: 2).
 * @returns {string} The formatted text with paragraph breaks.
 */
export const formatTextWithParagraphs = (text: string, sentencesPerParagraph = 2): string => {
  if (!text) return "";

  // First remove citations
  const cleanText = removeCitations(text);

  // Common abbreviations that shouldn't be treated as sentence endings
  const abbreviations = [
    "Dr",
    "Mr",
    "Mrs",
    "Ms",
    "Prof",
    "Sr",
    "Jr",
    "Ph.D",
    "M.D",
    "B.A",
    "M.A",
    "D.D.S",
    "Ph",
    "e.g",
    "i.e",
    "etc",
    "vs",
    "Inc",
    "Ltd",
    "Co",
    "Corp",
  ];

  // Replace abbreviation periods with a placeholder to protect them
  let protectedText = cleanText;
  abbreviations.forEach((abbrev) => {
    const pattern = new RegExp(`\\b${abbrev.replace(/\./g, "\\.")}\\b`, "gi");
    protectedText = protectedText.replace(pattern, (match) => match.replace(/\./g, "<!DOT!>"));
  });

  // Split by sentence-ending punctuation
  // Look for . ! ? followed by space and uppercase letter, or end of string
  const sentences = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/<!DOT!>/g, ".")); // Restore dots in abbreviations

  if (sentences.length === 0) return "";

  // First sentence gets its own paragraph
  const firstSentence = sentences[0];
  if (!firstSentence) return "";
  const paragraphs: string[] = [firstSentence];

  // Group remaining sentences into paragraphs of N sentences each
  for (let i = 1; i < sentences.length; i += sentencesPerParagraph) {
    const paragraphSentences = sentences
      .slice(i, Math.min(i + sentencesPerParagraph, sentences.length))
      .join(" ");
    if (paragraphSentences) {
      paragraphs.push(paragraphSentences);
    }
  }

  return paragraphs.join("\n\n");
};

/**
 * Processes summary text for display: removes citations and adds paragraph breaks.
 * @param {string} summary The raw summary text.
 * @returns {string} The processed summary ready for display.
 */
export const processSummaryText = (summary: string): string => {
  return formatTextWithParagraphs(summary, 2);
};
