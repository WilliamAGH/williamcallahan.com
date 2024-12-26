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
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/aVenture.svg',
    website: 'https://aventure.vc'
  },
  {
    id: 'tsbank',
    company: 'TS Bank',
    period: '2021 - 2022',
    role: 'Director of Innovation - Led digital transformation initiatives and fintech partnerships to modernize banking services.',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/TSBank.svg',
    website: 'https://www.tsbank.com'
  },
  {
    id: 'seekinvest',
    company: 'SeekInvest',
    period: '2021 - PRESENT',
    role: 'Founder & CEO - Developing innovative investment research tools and portfolio management solutions.',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/SeekInvest.svg',
    website: 'https://www.seekinvest.com'
  },
  {
    id: 'callahan-financial',
    company: 'Callahan Financial Planning',
    period: '2018 - 2020',
    role: 'Investment Advisor - Provided comprehensive financial planning and investment management services.',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/CallahanFinancial.svg',
    website: 'https://callahanplanning.com'
  },
  {
    id: 'mutual-first',
    company: 'Mutual First Federal Credit Union',
    period: '2016 - 2018',
    role: 'Financial Advisor - Guided members through investment decisions and retirement planning.',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/MutualFirst.svg',
    website: 'https://mutualfirst.com'
  },
  {
    id: 'morningstar',
    company: 'Morningstar',
    period: '2014 - 2016',
    role: 'Investment Research Analyst - Conducted in-depth analysis of investment products and market trends.',
    logo: 'https://williamcallahan.com/wp-content/uploads/2023/10/Morningstar.svg',
    website: 'https://morningstar.com'
  }
];