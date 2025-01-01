/**
 * Education Data
 */

import type { Education, Certification } from 'types/education';

export const highlightedCertifications: Certification[] = [
  {
    id: 'stanford-ml',
    institution: 'Stanford University',
    name: 'Machine Learning for Business with Python',
    year: '2024',
    logo: undefined,
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  },
  {
    id: 'stanford-llm',
    institution: 'Stanford University',
    name: 'Large Language Models for Business with Python',
    year: '2024',
    logo: undefined,
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  },
  {
    id: 'stanford-ai-design',
    institution: 'Stanford University',
    name: 'User-Centered Design for AI Applications',
    year: '2024',
    logo: undefined,
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  }
];

export const education: Education[] = [
  {
    id: 'creighton-mimfa',
    institution: 'Creighton University',
    degree: 'Master of Investment Management & Financial Analysis (MIMFA)',
    year: '2016',
    logo: undefined,
    website: 'https://www.creighton.edu',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'creighton-mba',
    institution: 'Creighton University',
    degree: 'Master of Business Administration (MBA)',
    year: '2016',
    logo: undefined,
    website: 'https://www.creighton.edu',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'uno-bsba',
    institution: 'University of Nebraska',
    degree: 'BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management',
    year: '2011',
    logo: undefined,
    website: 'https://www.unomaha.edu',
    location: 'Omaha, Nebraska'
  }
];

export const certifications: Certification[] = [
  {
    id: 'columbia-vc',
    institution: 'Columbia Business School',
    name: 'Executive Education – Venture Capital Decision Making',
    year: '2022',
    logo: undefined,
    website: 'https://gsb.columbia.edu',
    location: 'New York, New York'
  },
  {
    id: 'berkeley-vc',
    institution: 'University of California Berkeley',
    name: 'Certification in Startup Law & Venture Capital Investing',
    year: '2022',
    logo: undefined,
    website: 'https://www.berkeley.edu',
    location: 'Berkeley, California'
  },
  {
    id: 'cfa',
    institution: 'CFA Institute',
    name: 'Chartered Financial Analyst (CFA) Charterholder',
    year: '2012',
    logo: undefined,
    website: 'https://www.cfainstitute.org',
    location: 'Charlottesville, Virginia'
  },
  {
    id: 'cfp',
    institution: 'CFP Board',
    name: 'Certified Financial Planner (CFP) Professional Certification',
    year: '2012',
    logo: undefined,
    website: 'https://www.cfp.net',
    location: 'Washington, District of Columbia'
  }
];
