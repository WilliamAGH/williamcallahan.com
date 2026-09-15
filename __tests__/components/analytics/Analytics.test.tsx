import { render } from "@testing-library/react";
import { Analytics } from "@/components/analytics/analytics.client";

describe("Analytics", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
  });

  afterEach(() => {
    for (const id of ["simple-analytics", "clicky"]) document.getElementById(id)?.remove();
    process.env = originalEnv;
  });

  it("loads the active analytics providers", () => {
    const { container } = render(<Analytics />);

    expect(document.querySelector("script#simple-analytics")).toHaveAttribute(
      "src",
      "https://scripts.simpleanalyticscdn.com/latest.js",
    );
    expect(document.querySelector("script#simple-analytics")).toHaveAttribute(
      "data-collect-dnt",
      "true",
    );
    expect(document.querySelector("script#clicky")).toHaveAttribute(
      "src",
      "https://static.getclicky.com/101484018.js",
    );
    expect(document.querySelector("script#umami")).toBeNull();
    expect(document.querySelector("script#plausible")).toBeNull();
    expect(container.querySelectorAll("noscript")).toHaveLength(2);
  });

  it("does not load analytics in development", () => {
    process.env.NODE_ENV = "development";

    const { container } = render(<Analytics />);

    expect(container).toBeEmptyDOMElement();
  });
});
