/**
 * Experience Data
 *
 * Contains work history and professional experience data.
 * Used to populate the experience section of the portfolio.
 */

import type { Experience } from '../types/experience';

// Remember to update this date whenever the experience data or the Experience page design changes
export const updatedAt = '2025-04-30';

export const experiences: Experience[] = [
  {
    id: 'aventure',
    company: 'aVenture',
    period: '2023 - Present',
    startDate: '2023-01-01',
    role: 'Founder & CEO - Building a research platform with data on venture-backed startups and their investors to help founders and investors make better decisions.',
    logo: '/images/aVenture Favicon.png',
    website: 'https://aventure.vc',
    location: 'San Francisco, California'
  },
  {
    id: 'techstars',
    company: 'Techstars',
    period: '2023 - 2024',
    startDate: '2023-10-01',
    endDate: '2024-03-01',
    role: 'Received an investment from Techstars and participated in their accelerator program, focusing on pivoting aVenture to a research-based product and preparing to launch and fundraise.',
    logo: '/images/techstars_logo.png',
    website: 'https://www.techstars.com',
    location: 'New York, New York'
  },
  {
    id: 'seekinvest',
    company: 'SeekInvest',
    period: '2022 - Present',
    startDate: '2022-01-01',
    role: 'Advisor - A SaaS platform for helping investors ensure their investments are aligned with their value with values data overlaid on their portfolio.',
    logo: undefined,
    website: 'https://www.seekinvest.com',
    location: 'Chicago, Illinois'
  },
  {
    id: 'tsbank',
    company: 'TS Bank',
    period: '2021 - 2022',
    startDate: '2021-04-01',
    endDate: '2022-02-01',
    role: 'President of wealth management division following acquisition/sale of Callahan Financial Planning unit.',
    logo: undefined,
    website: 'https://www.tsbank.com',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'callahan-financial',
    company: 'Callahan Financial Planning',
    period: '2010 - 2022',
    startDate: '2010-02-01',
    endDate: '2022-02-01',
    role: 'Founded and led an SEC-registered investment advisor - Provided comprehensive financial planning and investment advisory services, including proprietary cloud software for managing complex and nuanced data sets in such relationships. Managed $225 million in assets on acquisition.',
    logo: '/images/callahan_planning_logo.png',
    website: 'https://callahanplanning.com',
    location: 'Omaha, Nebraska / San Francisco, California'
  },
  {
    id: 'mutual-first',
    company: 'Mutual First Federal Credit Union',
    period: '2020 - 2021',
    startDate: '2020-01-01',
    endDate: '2022-04-01',
    role: 'Board Member - Served on the board of directors, including as treasurer, overseeing the strategic direction and financial health of the credit union. Primary focus on product differentiation and pricing strategy, asset-liability management strategies, and growth strategy.',
    logo: undefined,
    website: 'https://mutualfirst.com',
    location: 'Omaha, Nebraska'
  },
  {
    id: 'morningstar',
    company: 'Morningstar',
    period: '2015 - 2019',
    startDate: '2015-01-01',
    endDate: '2019-12-31',
    role: 'Advisor to the executive team - Provided strategic and specific direction to the executive team on the development of new SaaS offerings for advanced investment research and portfolio management',
    logo: undefined,
    website: 'https://morningstar.com',
    location: 'Chicago, Illinois'
  }
];
