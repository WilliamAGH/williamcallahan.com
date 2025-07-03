/**
 * Education Data
 */

// Remember to update this date whenever the education data or the Education page design changes
export const updatedAt = "2025-06-28";

import type { Certification, Class, Education } from "@/types/education";
import { validateClassArray, validateEducationArray, validateCertificationArray } from "@/types/education";

const recentCoursesData: Class[] = [
  {
    id: "uc-berkeley-data-structures",
    institution: "University of California Berkeley",
    name: "Data Abstractions & Structures",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
    year: 2025,
  },
  {
    id: "san-mateo-object-oriented-java",
    institution: "College of San Mateo",
    name: "Object-Oriented Programming - Java",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
    year: 2025,
  },
  {
    id: "san-mateo-college-python",
    institution: "College of San Mateo",
    name: "Python Programming",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
    year: 2025,
  },
  {
    id: "san-mateo-college-unix-linux",
    institution: "College of San Mateo",
    name: "Unix & Linux Systems",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
    year: 2025,
  },
  {
    id: "berkeley-front-end-development",
    institution: "University of California Berkeley",
    name: "Front-End Web Development",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
    year: 2025,
  },
  {
    id: "stanford-ml",
    institution: "Stanford University",
    name: "Machine Learning for Business with Python",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
    year: 2024,
  },
  {
    id: "stanford-llm",
    institution: "Stanford University",
    name: "Large Language Models for Business with Python",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
    year: 2024,
  },
  {
    id: "stanford-ai-design",
    institution: "Stanford University",
    name: "User-Centered Design for AI Applications",
    website: "https://www.stanford.edu",
    location: "Stanford, California",
    year: 2024,
  },
];

export const recentCourses: Class[] = validateClassArray(recentCoursesData);

const educationData: Education[] = [
  {
    id: "creighton-mimfa",
    institution: "Creighton University",
    degree: "Master of Investment Management & Financial Analysis (MIMFA)",
    year: 2016,
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    logoScale: 1.0,
  },
  {
    id: "creighton-mba",
    institution: "Creighton University",
    degree: "Master of Business Administration (MBA)",
    year: 2016,
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    logoScale: 1.0,
  },
  {
    id: "uno-bsba",
    institution: "University of Nebraska",
    degree: "BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management",
    year: 2011,
    website: "https://www.unomaha.edu",
    location: "Omaha, Nebraska",
  },
];

export const education: Education[] = validateEducationArray(educationData);

const certificationsData: Certification[] = [
  {
    id: "columbia-vc",
    institution: "Columbia Business School",
    name: "Executive Education – Venture Capital Decision Making",
    year: 2022,
    website: "https://gsb.columbia.edu",
    location: "New York, New York",
  },
  {
    id: "berkeley-vc",
    institution: "University of California Berkeley",
    name: "Certification in Startup Law & Venture Capital Investing",
    year: 2022,
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
  },
  {
    id: "cfa",
    institution: "CFA Institute",
    name: "Chartered Financial Analyst (CFA) Charterholder",
    year: 2016,
    website: "https://www.cfainstitute.org",
    location: "Charlottesville, Virginia",
  },
  {
    id: "cfp",
    institution: "CFP Board",
    name: "Certified Financial Planner (CFP) Professional Certification",
    year: 2012,
    website: "https://www.cfp.net",
    location: "Washington, District of Columbia",
  },
];

export const certifications: Certification[] = validateCertificationArray(certificationsData);
