import { extractKeywords } from "@/lib/content-similarity/keyword-extractor";

describe("extractKeywords - tag filtering", () => {
  it("retains single-word keywords even when part of multi-word tags", () => {
    const title = "Machine Vision Systems in Modern Robotics";
    const description =
      "Machine vision technology enables robots to perceive their environment. " +
      "These vision systems use machine learning algorithms, but the machine hardware " +
      "is equally important. Advanced machines with vision capabilities are transforming industry.";

    const existingTags = ["machine learning"];

    const keywords = extractKeywords(title, description, existingTags, 15);

    expect(keywords).toContain("machine");
  });

  it("removes exact multi-word tag matches", () => {
    const title = "Machine Learning Guide";
    const description =
      "Machine learning is evolving. This machine learning tutorial covers basics.";
    const existingTags = ["machine learning"];

    const keywords = extractKeywords(title, description, existingTags, 10);

    expect(keywords).not.toContain("machine learning");
  });

  it("removes exact single-word tag matches", () => {
    const title = "React Development Best Practices";
    const description =
      "React is a popular framework. React development requires understanding React components.";
    const existingTags = ["react", "javascript"];

    const keywords = extractKeywords(title, description, existingTags, 10);

    expect(keywords).not.toContain("react");
    expect(keywords).not.toContain("javascript");
  });
});
