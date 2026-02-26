import { buildEmbeddingText } from "@/lib/db/embedding-input-contracts";
import { INVESTMENT_EMBEDDING_FIELDS } from "@/lib/db/embedding-field-specs";

describe("investment embedding input", () => {
  it("produces canonical labels for a full investment record", () => {
    const result = buildEmbeddingText(INVESTMENT_EMBEDDING_FIELDS, {
      name: "Accern",
      description: "AI platform for financial services",
      category: "AI / ML",
      stage: "Series B",
      status: "Active",
      operating_status: "Operating",
      location: "New York, NY",
      type: "Direct",
      invested_year: "2022",
      accelerator: null,
    });

    expect(result).toContain("Company Name: Accern");
    expect(result).toContain("Company Description: AI platform");
    expect(result).toContain("Business Sector: AI / ML");
    expect(result).toContain("Funding Round at Entry: Series B");
    expect(result).toContain("Investment Outcome: Active");
    expect(result).toContain("Company Operating State: Operating");
    expect(result).toContain("Company Headquarters: New York, NY");
    expect(result).toContain("Investment Vehicle: Direct");
    expect(result).toContain("Year of Investment: 2022");
    expect(result).not.toContain("Startup Accelerator");
  });

  it("includes accelerator fields when present", () => {
    const result = buildEmbeddingText(INVESTMENT_EMBEDDING_FIELDS, {
      name: "TestCo",
      description: "Test company",
      category: null,
      stage: "Seed+",
      status: "Active",
      operating_status: "Operating",
      location: null,
      type: "Direct",
      invested_year: "2023",
      accelerator: { program: "techstars", batch: "NYC 2023" },
    });

    expect(result).toContain("Startup Accelerator Program: techstars");
    expect(result).toContain("Accelerator Cohort: NYC 2023");
    expect(result).not.toContain("Business Sector");
    expect(result).not.toContain("Company Headquarters");
  });

  it("produces labels in the order defined by the contract", () => {
    const result = buildEmbeddingText(INVESTMENT_EMBEDDING_FIELDS, {
      name: "Ordered",
      description: "Test",
      category: "Fintech",
      stage: "Series A",
      status: "Active",
      operating_status: "Operating",
      location: "SF",
      type: "Direct",
      invested_year: "2021",
    });

    const nameIdx = result.indexOf("Company Name:");
    const descIdx = result.indexOf("Company Description:");
    const sectorIdx = result.indexOf("Business Sector:");
    const stageIdx = result.indexOf("Funding Round at Entry:");

    expect(nameIdx).toBeLessThan(descIdx);
    expect(descIdx).toBeLessThan(sectorIdx);
    expect(sectorIdx).toBeLessThan(stageIdx);
  });
});
