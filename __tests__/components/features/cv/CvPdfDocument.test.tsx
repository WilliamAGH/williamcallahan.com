/** @vitest-environment node */
/**
 * CvPdfDocument tests
 */

import path from "path";
import { renderToStaticMarkup } from "react-dom/server";

const loadCvPdfDocument = async () => {
  const registerMock = vi.fn();

  // Reset modules to ensure clean import
  vi.resetModules();

  const hadWindow = Object.hasOwn(globalThis, "window");
  const originalWindow = hadWindow ? (globalThis as { window: unknown }).window : undefined;

  try {
    (globalThis as { window?: unknown }).window = undefined;
  } catch {
    /* noop */
  }

  vi.doMock("node:fs", async (importOriginal) => ({
    __esModule: true,
    ...(await importOriginal<typeof import("node:fs")>()),
    existsSync: vi.fn().mockReturnValue(true),
  }));

  vi.doMock("@react-pdf/renderer", () => {
    const React = require("react");
    const createPrimitive = (tag: string) => {
      const Primitive = ({
        children,
        wrap: _wrap,
        ...props
      }: {
        children?: React.ReactNode;
        wrap?: unknown;
      }) => React.createElement(tag, props, children);
      Primitive.displayName = `Mock${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
      return Primitive;
    };

    const Document = ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "pdf-document", ...props }, children);
    Document.displayName = "MockDocument";

    return {
      __esModule: true,
      Document,
      Page: createPrimitive("section"),
      View: createPrimitive("div"),
      Text: createPrimitive("span"),
      Link: ({ children, src, ...props }: { children?: React.ReactNode; src: string }) =>
        React.createElement("a", { href: src, ...props }, children),
      Svg: createPrimitive("svg"),
      Path: createPrimitive("path"),
      Rect: createPrimitive("rect"),
      Circle: createPrimitive("circle"),
      Font: { register: registerMock },
      StyleSheet: { create: (styles: unknown) => styles },
    };
  });

  const loadedModule = await import("@/components/features/cv/CvPdfDocument");

  if (hadWindow) {
    (globalThis as { window: unknown }).window = originalWindow;
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  return { module: loadedModule, registerMock };
};

describe("CvPdfDocument", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("registers IBM Plex fonts from the filesystem when running on the server", async () => {
    const { registerMock } = await loadCvPdfDocument();

    expect(registerMock).toHaveBeenCalledTimes(1);

    const registration = registerMock.mock.calls[0]?.[0];
    expect(registration).toBeDefined();
    expect(registration.family).toBe("IBM Plex Mono");

    const sources = (registration.fonts ?? []).map((font: { src: string }) => font.src);
    const fontsDir = path.join("public", "fonts", "ibm-plex-mono");

    expect(sources).toEqual(
      expect.arrayContaining([
        path.join(process.cwd(), fontsDir, "IBMPlexMono-Regular.ttf"),
        path.join(process.cwd(), fontsDir, "IBMPlexMono-Italic.ttf"),
        path.join(process.cwd(), fontsDir, "IBMPlexMono-SemiBold.ttf"),
      ]),
    );
  });

  it("renders the PDF outline with expected sections", async () => {
    vi.useFakeTimers({ now: new Date("2025-11-08T09:00:00Z") });

    const { module } = await loadCvPdfDocument();

    const CvPdfDocument = module.default;
    const html = renderToStaticMarkup(<CvPdfDocument />);

    expect(html).toContain('data-testid="pdf-document"');
    expect(html).toContain("Professional Summary");
    expect(html).toContain("Highlighted Technical Projects");
    expect(html).not.toContain("Distinguished Qualifications");
    expect(html).toContain("Last updated: November 8, 2025");
  });
});
