/**
 * Education Data
 */

// Remember to update this date whenever the education data or the Education page design changes
export const updatedAt = "2025-10-30";

import {
  type Certification,
  type Class,
  type Education,
  validateClassArray,
  validateEducationArray,
  validateCertificationArray,
} from "@/types/education";

const recentCoursesData: Class[] = [
  // Stanford University — Priority
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
  {
    id: "san-mateo-programming-methods-java",
    institution: "College of San Mateo",
    name: "Programming Methods - Java",
    website: "https://collegeofsanmateo.edu",
    location: "San Mateo, California",
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
  // University of California Berkeley — Then others
  {
    id: "berkeley-front-end-development",
    institution: "University of California Berkeley",
    name: "Web Development (JavaScript / TypeScript)",
    website: "https://www.berkeley.edu",
    location: "Berkeley, California",
    year: 2025,
  },
  // Creighton University — Courses from MIMFA/MBA programs (2014–2016)
  {
    id: "creighton-fixed-income-derivatives-i",
    institution: "Creighton University",
    name: "Fixed Income and Derivatives",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2014,
  },
  {
    id: "creighton-capital-markets",
    institution: "Creighton University",
    name: "Capital Markets",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2014,
  },
  {
    id: "creighton-financial-statement-analysis-i",
    institution: "Creighton University",
    name: "Financial Statement Analysis",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2014,
  },
  {
    id: "creighton-equity-analysis",
    institution: "Creighton University",
    name: "Equity Analysis",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2014,
  },
  {
    id: "creighton-quantitative-analysis",
    institution: "Creighton University",
    name: "Quantitative Methods / Quantitative Analysis",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2015,
  },
  {
    id: "creighton-fixed-income-derivatives-ii",
    institution: "Creighton University",
    name: "Fixed Income & Derivatives - Advanced Topics",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2015,
  },
  {
    id: "creighton-leadership-and-organizational-behavior",
    institution: "Creighton University",
    name: "Leadership and Organizational Behavior",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2015,
  },
  {
    id: "creighton-business-ethics-and-society",
    institution: "Creighton University",
    name: "Business, Ethics and Society",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2015,
  },
  {
    id: "creighton-business-world-hong-kong",
    institution: "Creighton University",
    name: "Trade & Finance in Asia: Mainland China & Hong Kong",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2015,
  },
  {
    id: "creighton-ethical-and-professional-standards",
    institution: "Creighton University",
    name: "Ethical and Professional Standards",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-portfolio-management",
    institution: "Creighton University",
    name: "Portfolio Management",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-business-policy-managerial-action",
    institution: "Creighton University",
    name: "Business Policy and Managerial Action",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-advanced-financial-analysis",
    institution: "Creighton University",
    name: "Financial StatementAnalysis - Advanced Topics",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-asset-management-portfolio-context",
    institution: "Creighton University",
    name: "Asset Management within a Portfolio Context",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-advanced-topics-it-management",
    institution: "Creighton University",
    name: "Information Technology Management - Advanced Topics",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-leadership-presentation-skills",
    institution: "Creighton University",
    name: "Leadership Presentation Skills",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
  },
  {
    id: "creighton-high-impact-leadership-skills",
    institution: "Creighton University",
    name: "High Impact Leadership Skills",
    website: "https://www.creighton.edu",
    location: "Omaha, Nebraska",
    year: 2016,
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
