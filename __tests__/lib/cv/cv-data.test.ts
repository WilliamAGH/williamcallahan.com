/**
 * getCvData unit tests
 */

import { experiences } from "@/data/experience";
import { getCvData } from "@/lib/cv/cv-data";

const freezeTime = (isoTimestamp: string): void => {
  jest.useFakeTimers({
    now: new Date(isoTimestamp),
    doNotFake: ["nextTick", "performance"],
  });
};

describe("getCvData", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("filters featured experiences and derives bullet points", () => {
    freezeTime("2025-11-08T12:34:56Z");

    const data = getCvData();
    const expectedFeaturedCount = experiences.filter(
      (experienceItem) => experienceItem.cvFeatured,
    ).length;

    expect(data.experiences).toHaveLength(expectedFeaturedCount);

    const callahan = data.experiences.find((item) => item.id === "callahan-financial");
    expect(callahan).toBeDefined();
    expect(callahan?.headline).toBe("Founded and led an SEC-registered investment advisor");
    expect(callahan?.bullets).toContain("Managed $225 million in assets on acquisition");
    expect(callahan?.displayWebsite).toBe("tsbank.com");
  });

  it("formats contact metadata and current date display", () => {
    freezeTime("2025-11-08T12:00:00Z");

    const data = getCvData();

    expect(data.personalSiteHost).toBe("williamcallahan.com");
    expect(data.aventureHost).toBe("aventure.vc");
    expect(data.linkedInLabel).toBe("linkedin.com/in/williamacallahan");
    expect(data.lastUpdatedDisplay).toBe("November 8, 2025");
  });

  it("limits project tags and groups featured courses by institution", () => {
    freezeTime("2025-11-08T08:00:00Z");

    const data = getCvData();

    const aventureProject = data.projects.find((project) => project.id === "aVenture.vc");
    expect(aventureProject).toBeDefined();
    expect(aventureProject?.tags).toHaveLength(6);

    const institutions = data.groupedCourses.map((group) => group.institution);
    expect(institutions).toEqual([
      "Stanford University",
      "College of San Mateo",
      "University of California Berkeley",
    ]);

    const collegeOfSanMateo = data.groupedCourses.find(
      (group) => group.institution === "College of San Mateo",
    );
    expect(collegeOfSanMateo).toBeDefined();
    expect(collegeOfSanMateo?.courses.every((course) => course.year === "2025")).toBe(true);
  });

  it("falls back to raw values when URLs cannot be parsed", async () => {
    await jest.isolateModulesAsync(async () => {
      const actualCv = jest.requireActual<typeof import("@/data/cv")>("@/data/cv");

      jest.doMock("@/data/metadata", () => ({
        metadata: {
          site: {
            url: "notaurl",
          },
        },
      }));

      jest.doMock("@/data/cv", () => ({
        __esModule: true,
        ...actualCv,
        CV_CONTACT_LINKS: {
          ...actualCv.CV_CONTACT_LINKS,
          aventureUrl: "notaurl",
          linkedInUrl: "nota-url",
        },
      }));

      const { getCvData: getCvDataWithMocks } = await import("@/lib/cv/cv-data");

      freezeTime("2025-05-01T00:00:00Z");

      const data = getCvDataWithMocks();
      expect(data.personalSiteHost).toBe("notaurl");
      expect(data.linkedInLabel).toBe("nota-url");
      expect(data.aventureHost).toBe("notaurl");

      jest.useRealTimers();
    });
  });
});
