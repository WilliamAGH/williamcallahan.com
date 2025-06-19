/**
 * aVenture Icon Component Tests
 */

import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AVentureIcon } from "../../../../components/ui/social-icons/aventure-icon";

describe("AVenture Icon", () => {
  it("renders correctly", () => {
    const { container } = render(<AVentureIcon />);

    // Check if SVG was rendered
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();

    // Check if the path for the icon exists
    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
  });

  it("passes className prop to the SVG", () => {
    const testClass = "test-class";
    const { container } = render(<AVentureIcon className={testClass} />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass(testClass);
  });

  it("passes additional props to the SVG", () => {
    const { getByTestId } = render(<AVentureIcon data-testid="aventure-icon" />);

    expect(getByTestId("aventure-icon")).toBeInTheDocument();
  });
});
