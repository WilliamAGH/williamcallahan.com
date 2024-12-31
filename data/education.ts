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
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/creighton.svg',
    website: 'https://www.creighton.edu'
  },
  {
    id: 'creighton-mimfa',
    institution: 'Creighton University',
    degree: 'Master of Investment Management & Financial Analysis (MIMFA)',
    year: '2011',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/creighton.svg',
    website: 'https://www.creighton.edu'
  },
  {
    id: 'uno-bsba',
    institution: 'University of Nebraska at Omaha',
    degree: 'BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management',
    year: '2011',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/uno.svg',
    website: 'https://www.unomaha.edu'
  }
];

export const certifications: Certification[] = [
  {
    id: 'mit-ai',
    institution: 'MIT',
    name: 'Designing and Building AI Products and Services',
    year: '2023',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/mit.svg',
    website: 'https://www.mit.edu'
  },
  {
    id: 'columbia-vc',
    institution: 'Columbia Business School',
    name: 'Executive Education – Venture Capital Decision Making',
    year: '2022',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/columbia.svg',
    website: 'https://www8.gsb.columbia.edu'
  },
  {
    id: 'berkeley-vc',
    institution: 'University of California Berkeley',
    name: 'Certification in Startup Law & Venture Capital Investing',
    year: '2016',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/berkeley.svg',
    website: 'https://www.berkeley.edu'
  },
  {
    id: 'cfa',
    institution: 'CFA Institute',
    name: 'Chartered Financial Analyst (CFA) Charterholder',
    year: '2012',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/cfa.svg',
    website: 'https://www.cfainstitute.org'
  },
  {
    id: 'cfp',
    institution: 'CFP Board',
    name: 'Certified Financial Planner (CFP) Professional (NYU)',
    year: '2012',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/cfp.svg',
    website: 'https://www.cfp.net'
  }
];
