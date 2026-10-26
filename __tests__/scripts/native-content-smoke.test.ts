/** @vitest-environment node */
import { createRequire } from "node:module";
import { vi } from "vitest";

vi.mock("cheerio", () => createRequire(import.meta.url)("cheerio"));

import { validateNativeContentHtml } from "../../scripts/native-content-smoke";

const expected = {
  heading: "Brief",
  destination: "https://example.com/project",
  description: "A terminal chat client.",
};
const native =
  '<h1>Brief</h1><p>A terminal chat client.</p><a href="https://example.com/project">Visit Project</a>';

it("accepts native project content and its actual destination", () => {
  expect(validateNativeContentHtml(native, expected)).toBe(true);
});

it("matches the serialized root URL when trusted project data omits its trailing slash", () => {
  expect(
    validateNativeContentHtml('<h1>Project</h1><a href="https://example.com/">Visit Project</a>', {
      heading: "Project",
      destination: "https://example.com",
    }),
  ).toBe(true);
});

it("does not mistake the same content inside Flight scripts for native markup", () => {
  expect(validateNativeContentHtml(`<script>${JSON.stringify(native)}</script>`, expected)).toBe(
    false,
  );
});

it("does not accept a profile body waiting inside a hidden streamed segment", () => {
  expect(
    validateNativeContentHtml(
      '<h1>~/contact</h1><div hidden id="S:3"><a href="https://example.com/profile">Profile</a></div>',
      {
        heading: "~/contact",
        destination: "https://example.com/profile",
      },
    ),
  ).toBe(false);
});

it("rejects a heading and description whose real destination is missing", () => {
  expect(validateNativeContentHtml("<h1>Brief</h1><p>A terminal chat client.</p>", expected)).toBe(
    false,
  );
});

it("does not accept a shared header link as a contact card", () => {
  expect(
    validateNativeContentHtml(
      '<h1>~/contact</h1><a href="https://example.com/profile">Profile</a>',
      {
        heading: "~/contact",
        destination: "https://example.com/profile",
        destinationScope: ".social-card",
      },
    ),
  ).toBe(false);
});
