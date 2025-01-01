/**
 * Experience Data
 *
 * Contains work history and professional experience data.
 * Used to populate the experience section of the portfolio.
 */

import type { Experience } from '@/types/experience';

export const experiences: Experience[] = [
  {
    id: 'aventure',
    company: 'aVenture',
    period: '2020 - PRESENT',
    role: 'Founder & CEO - Building a platform to make venture capital accessible to everyone, normalizing its role in modern portfolio management.',
    logo: '/images/aVenture Favicon.png',  // Using local logo file with correct name
    website: 'https://aventure.vc'
  },
  {
    id: 'tsbank',
    company: 'TS Bank',
    period: '2021 - 2022',
    role: 'Director of Innovation - Led digital transformation initiatives and fintech partnerships to modernize banking services.',
    logo: undefined,  // Will use website for logo fetching
    website: 'https://www.tsbank.com'
  },
  {
    id: 'seekinvest',
    company: 'SeekInvest',
    period: '2021 - PRESENT',
    role: 'Founder & CEO - Developing innovative investment research tools and portfolio management solutions.',
    logo: undefined,  // Will use website for logo fetching
    website: 'https://www.seekinvest.com'
  },
  {
    id: 'callahan-financial',
    company: 'Callahan Financial Planning',
    period: '2018 - 2020',
    role: 'Investment Advisor - Provided comprehensive financial planning and investment management services.',
    logo: undefined,  // Will use website for logo fetching
    website: 'https://callahanplanning.com'
  },
  {
    id: 'mutual-first',
    company: 'Mutual First Federal Credit Union',
    period: '2016 - 2018',
    role: 'Financial Advisor - Guided members through investment decisions and retirement planning.',
    logo: undefined,  // Will use website for logo fetching
    website: 'https://mutualfirst.com'
  },
  {
    id: 'morningstar',
    company: 'Morningstar',
    period: '2014 - 2016',
    role: 'Investment Research Analyst - Conducted in-depth analysis of investment products and market trends.',
    logo: undefined,  // Will use website for logo fetching
    website: 'https://morningstar.com'
  }
];
