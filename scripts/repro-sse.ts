import { fetch } from "bun";

const baseUrl = "http://localhost:3000";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

console.log("1. Fetching AI Token...");

// 1. Get Token and Cookie
const tokenRes = await fetch(`${baseUrl}/api/ai/token`, {
  headers: {
    "User-Agent": "repro-script",
    Origin: baseUrl,
    Referer: `${baseUrl}/bookmarks/test`,
  },
});

if (!tokenRes.ok) {
  console.error("Failed to get token:", await tokenRes.text());
  process.exit(1);
}

const tokenData = (await tokenRes.json()) as { token?: string };
const token = tokenData.token;
if (typeof token !== "string" || token.length === 0) {
  console.error("Token response missing token:", tokenData);
  process.exit(1);
}
const cookieHeader = tokenRes.headers.get("set-cookie");

console.log("Token received:", token.slice(0, 20) + "...");
console.log("Cookie received:", cookieHeader ? "Yes" : "No");

// 2. Start Chat Stream
console.log("\n2. Starting Chat Stream...");
const chatRes = await fetch(`${baseUrl}/api/ai/chat/bookmark-analysis`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Cookie: cookieHeader || "",
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": "repro-script",
    Origin: baseUrl,
    Referer: `${baseUrl}/bookmarks/test`,
  },
  body: JSON.stringify({
    userText: `Analyze this bookmark:
Title: z-agent-browser
URL: https://github.com/zm2231/agent-browser
Description: z-agent-browser is a Rust-based CLI fork of vercel-labs/agent-browser for AI agent browser automation, supporting authenticated sites, bot detection bypass, and existing tabs. It adds stealth mode, runtime state loading for cookies and localStorage, auto-persistence, Gmail hybrid workflows, and Playwright MCP integration. Token-efficient commands include snapshot -i for navigation and eval for data extraction.
Content: The repository hosts z-agent-browser, a Rust-based command line tool that extends the original agent-browser project to provide advanced browser automation capabilities for AI agents. It adds features like stealth mode to mitigate bot detection, runtime state loading for authenticated sessions, and persistent context management. The tool is designed to be token-efficient, offering commands for navigation, snapshotting, and data extraction. Key components include a hybrid workflow for Gmail, integration with Playwright MCP, and support for connecting to existing browser instances via CDP. It is intended for developers building AI agents that need to interact with modern web applications securely and efficiently.`,
    feature: "bookmark-analysis",
    apiMode: "chat_completions",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bookmark_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            category: { type: "string" },
            highlights: { type: "array", items: { type: "string" } },
            contextualDetails: {
              type: "object",
              additionalProperties: false,
              properties: {
                primaryDomain: { type: ["string", "null"] },
                format: { type: ["string", "null"] },
                accessMethod: { type: ["string", "null"] },
              },
              required: ["primaryDomain", "format", "accessMethod"],
            },
            relatedResources: { type: "array", items: { type: "string" } },
            targetAudience: { type: "string" },
          },
          required: [
            "summary",
            "category",
            "highlights",
            "contextualDetails",
            "relatedResources",
            "targetAudience",
          ],
        },
      },
    },
  }),
});

if (!chatRes.ok) {
  console.error("Chat request failed:", chatRes.status, await chatRes.text());
  process.exit(1);
}

const reader = chatRes.body?.getReader();
if (!reader) {
  console.error("No body reader available");
  process.exit(1);
}

const decoder = new TextDecoder();
let buffer = "";

console.log("\n--- STREAM OUTPUT ---");

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  process.stdout.write(chunk); // Print raw chunks to see boundaries
  buffer += chunk;
}

console.log("\n--- END STREAM ---");

// 3. Analyze Buffer for malformation
console.log("\n3. Analysis:");
const lines = buffer.split("\n");
for (const line of lines) {
  if (line.startsWith("data: ")) {
    try {
      JSON.parse(line.slice(6));
    } catch (error: unknown) {
      console.error("MALFORMED JSON DETECTED in line:", line);
      console.error("Error:", toErrorMessage(error));
    }
  }
}
