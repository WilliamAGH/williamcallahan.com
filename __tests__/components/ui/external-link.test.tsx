import { render } from "@testing-library/react";

import { ExternalLink } from "@/components/ui/external-link.client";

describe("ExternalLink", () => {
  it("renders as an inline anchor so prose text wraps naturally on narrow viewports", () => {
    const { container } = render(
      <ExternalLink href="https://example.com">
        a long link label that must wrap at word boundaries on mobile
      </ExternalLink>,
    );
    const anchor = container.querySelector("a");
    expect(anchor).toBeInTheDocument();
    // inline-flex fragments across line breaks and detaches the trailing icon (mobile overflow)
    expect(anchor?.className).not.toContain("inline-flex");
    expect(anchor?.className).not.toContain("inline-block");
  });

  it("renders the trailing icon as an inline glyph sized to the surrounding text", () => {
    const { container } = render(<ExternalLink href="https://example.com">Example</ExternalLink>);
    const icon = container.querySelector("a svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("class")).toContain("inline-block");
    expect(icon?.getAttribute("class")).toContain("h-[1em]");
  });

  it("opens external links in a new tab with noopener semantics", () => {
    const { container } = render(<ExternalLink href="https://example.com">Example</ExternalLink>);
    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a span when no href is provided", () => {
    const { container } = render(<ExternalLink href={null}>Unavailable destination</ExternalLink>);
    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container.querySelector("span")).toHaveTextContent("Unavailable destination");
  });
});
