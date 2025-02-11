/**
 * Education Data
 * All dates are stored in Pacific timezone.
 * Completion years are set to December 31st of the year.
 */

import type { Education, Certification, Class } from 'types/education';
import { toISO } from '../lib/dateTime';

export const recentCourses: Class[] = [
  {
    id: 'de-anza-data-structures',
    institution: 'De Anza College',
    name: 'Data Abstractions & Structures',
    logo: '/images/de_anza_college_logo.png',
    website: 'https://deanza.edu',
    location: 'Cupertino, California'
  },
  {
    id: 'san-mateo-object-oriented',
    institution: 'College of San Mateo',
    name: 'Object-Oriented Programming',
    logo: '/images/college_of_san_mateo_logo.png',
    website: 'https://collegeofsanmateo.edu',
    location: 'San Mateo, California'
  },
  {
    id: 'san-mateo-college-python',
    institution: 'College of San Mateo',
    name: 'Python Programming',
    logo: '/images/college_of_san_mateo_logo.png',
    website: 'https://collegeofsanmateo.edu',
    location: 'San Mateo, California'
  },
  {
    id: 'san-mateo-college-unix-linux',
    institution: 'College of San Mateo',
    name: 'Unix & Linux Systems',
    logo: '/images/college_of_san_mateo_logo.png',
    website: 'https://collegeofsanmateo.edu',
    location: 'San Mateo, California'
  },
  {
    id: 'berkeley-front-end-development',
    institution: 'University of California Berkeley',
    name: 'Front-End Web Development',
    logo: '/images/uc_berkeley_logo.png',
    website: 'https://www.berkeley.edu',
    location: 'Berkeley, California'
  },
  {
    id: 'stanford-ml',
    institution: 'Stanford University',
    name: 'Machine Learning for Business with Python',
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  },
  {
    id: 'stanford-llm',
    institution: 'Stanford University',
    name: 'Large Language Models for Business with Python',
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  },
  {
    id: 'stanford-ai-design',
    institution: 'Stanford University',
    name: 'User-Centered Design for AI Applications',
    website: 'https://www.stanford.edu',
    location: 'Stanford, California'
  }
];

export const education: Education[] = [
  {
    id: 'creighton-mimfa',
    institution: 'Creighton University',
    degree: 'Master of Investment Management & Financial Analysis (MIMFA)',
    year: toISO('2016-12-31'),
    website: 'https://www.creighton.edu',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'creighton-mba',
    institution: 'Creighton University',
    degree: 'Master of Business Administration (MBA)',
    year: toISO('2016-12-31'),
    website: 'https://www.creighton.edu',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'uno-bsba',
    institution: 'University of Nebraska',
    degree: 'BSBA in Corporate Finance, Banking & Financial Markets, Investment Science & Portfolio Management',
    year: toISO('2011-12-31'),
    website: 'https://www.unomaha.edu',
    location: 'Omaha, Nebraska'
  }
];

export const certifications: Certification[] = [
  {
    id: 'columbia-vc',
    institution: 'Columbia Business School',
    name: 'Executive Education – Venture Capital Decision Making',
    year: toISO('2022-12-31'),
    website: 'https://gsb.columbia.edu',
    location: 'New York, New York'
  },
  {
    id: 'berkeley-vc',
    institution: 'University of California Berkeley',
    name: 'Certification in Startup Law & Venture Capital Investing',
    logo: '/images/uc_berkeley_logo.png',
    year: toISO('2022-12-31'),
    website: 'https://www.berkeley.edu',
    location: 'Berkeley, California'
  },
  {
    id: 'cfa',
    institution: 'CFA Institute',
    name: 'Chartered Financial Analyst (CFA) Charterholder',
    logo: '/images/cfa_institute_logo.png',
    year: toISO('2012-12-31'),
    website: 'https://www.cfainstitute.org',
    location: 'Charlottesville, Virginia'
  },
  {
    id: 'cfp',
    institution: 'CFP Board',
    name: 'Certified Financial Planner (CFP) Professional Certification',
    year: toISO('2012-12-31'),
    website: 'https://www.cfp.net',
    location: 'Washington, District of Columbia'
  }
];
