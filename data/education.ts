/**
 * Education Data
 */

import type { Education, Certification } from "@/types/education";

export const education: Education[] = [
  {
    id: 'creighton-mba',
    institution: 'Creighton University',
    degree: 'Master of Business Administration (MBA)',
    year: '2016',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.creighton.edu'
  },
  {
    id: 'creighton-mimfa',
    institution: 'Creighton University',
    degree: 'Master of Investment Management & Financial Analysis (MIMFA)',
    year: '2011',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.creighton.edu'
  },
  {
    id: 'uno-bsba',
    institution: 'University of Nebraska at Omaha',
    degree: 'BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management',
    year: '2011',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.unomaha.edu'
  }
];

export const certifications: Certification[] = [
  {
    id: 'mit-ai',
    institution: 'MIT',
    name: 'Designing and Building AI Products and Services',
    year: '2023',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.mit.edu'
  },
  {
    id: 'columbia-vc',
    institution: 'Columbia Business School',
    name: 'Executive Education – Venture Capital Decision Making',
    year: '2022',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www8.gsb.columbia.edu'
  },
  {
    id: 'berkeley-vc',
    institution: 'University of California Berkeley',
    name: 'Certification in Startup Law & Venture Capital Investing',
    year: '2016',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.berkeley.edu'
  },
  {
    id: 'cfa',
    institution: 'CFA Institute',
    name: 'Chartered Financial Analyst (CFA) Charterholder',
    year: '2012',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.cfainstitute.org'
  },
  {
    id: 'cfp',
    institution: 'CFP Board',
    name: 'Certified Financial Planner (CFP) Professional (NYU)',
    year: '2012',
    // Using website for logo fetching
    logo: undefined,
    website: 'https://www.cfp.net'
  }
];
