/**
 * Education Data
 */

// Remember to update this date whenever the education data or the Education page design changes
export const updatedAt = "2025-05-01";

import type { Certification, Class, Education } from "types/education";

export const recentCourses: Class[] = [
  {
    id: "uc-berkeley-data-structures",
    institution: "University of California Berkeley",
    name: "Data Abstractions & Structures",
    logo: "/images/uc_berkeley_logo.png",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
  },
  {
    id: "san-mateo-object-oriented",
    institution: "College of San Mateo",
    name: "Object-Oriented Programming",
    logo: "/images/college_of_san_mateo_logo.png",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
  },
  {
    id: "san-mateo-college-python",
    institution: "College of San Mateo",
    name: "Python Programming",
    logo: "/images/college_of_san_mateo_logo.png",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
  },
  {
    id: "san-mateo-college-unix-linux",
    institution: "College of San Mateo",
    name: "Unix & Linux Systems",
    logo: "/images/college_of_san_mateo_logo.png",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
  },
  {
    id: "berkeley-front-end-development",
    institution: "University of California Berkeley",
    name: "Front-End Web Development",
    logo: "/images/uc_berkeley_logo.png",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
  },
  {
    id: "stanford-ml",
    institution: "Stanford University",
    name: "Machine Learning for Business with Python",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
  },
  {
    id: "stanford-llm",
    institution: "Stanford University",
    name: "Large Language Models for Business with Python",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
  },
  {
    id: "stanford-ai-design",
    institution: "Stanford University",
    name: "User-Centered Design for AI Applications",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
  },
];

export const education: Education[] = [
  {
    id: "creighton-mimfa",
    institution: "Creighton University",
    degree: "Master of Investment Management & Financial Analysis (MIMFA)",
    year: "2016",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    logoScale: 1.0,
  },
  {
    id: "creighton-mba",
    institution: "Creighton University",
    degree: "Master of Business Administration (MBA)",
    year: "2016",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    logoScale: 1.0,
  },
  {
    id: "uno-bsba",
    institution: "University of Nebraska",
    degree:
      "BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management",
    year: "2011",
    website: "https://www.unomaha.edu",
    location: "Omaha, Nebraska",
  },
];

export const certifications: Certification[] = [
  {
    id: "columbia-vc",
    institution: "Columbia Business School",
    name: "Executive Education – Venture Capital Decision Making",
    year: "2022",
    website: "https://gsb.columbia.edu",
    location: "New York, New York",
  },
  {
    id: "berkeley-vc",
    institution: "University of California Berkeley",
    name: "Certification in Startup Law & Venture Capital Investing",
    logo: "/images/uc_berkeley_logo.png",
    year: "2022",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
  },
  {
    id: "cfa",
    institution: "CFA Institute",
    name: "Chartered Financial Analyst (CFA) Charterholder",
    logo: "/images/cfa_institute_logo.png",
    year: "2012",
    website: "https://www.cfainstitute.org",
    location: "Charlottesville, Virginia",
  },
  {
    id: "cfp",
    institution: "CFP Board",
    name: "Certified Financial Planner (CFP) Professional Certification",
    year: "2012",
    website: "https://www.cfp.net",
    location: "Washington, District of Columbia",
  },
];
