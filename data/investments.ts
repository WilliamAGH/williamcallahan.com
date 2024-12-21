/**
 * Investments Data
 */

import type { Investment } from '@/types/investment';

export const investments: Investment[] = [
  {
    id: 'aventure',
    name: 'aVenture',
    description: 'A platform democratizing access to venture capital investments.',
    type: 'Direct',
    stage: 'Seed',
    year: '2020',
    status: 'Active',
    logo: '/images/aventure-logo.svg',
    website: 'https://aventure.vc',
    accelerator: {
      program: 'techstars',
      batch: 'Winter 2023',
      location: 'NYC',
      logo: '/images/techstars-logo.svg'
    },
    details: [
      { label: 'Investment Type', value: 'Direct Investment' },
      { label: 'Entry Stage', value: 'Seed' },
      { label: 'Sector', value: 'FinTech' },
      { label: 'Role', value: 'Founder & CEO' }
    ]
  },
  {
    id: 'fintech-fund',
    name: 'Fintech Innovation Fund',
    description: 'Early-stage investments in financial technology startups.',
    type: 'Fund',
    stage: 'Early-Stage',
    year: '2021',
    status: 'Active',
    logo: '/images/fintech-fund-logo.svg',
    website: 'https://fintechfund.vc',
    accelerator: {
      program: 'ycombinator',
      batch: 'Winter 2022',
      location: 'San Francisco',
      logo: '/images/ycombinator-logo.svg'
    },
    details: [
      { label: 'Investment Type', value: 'Fund' },
      { label: 'Focus Stage', value: 'Early-Stage' },
      { label: 'Sector', value: 'FinTech' },
      { label: 'Role', value: 'Limited Partner' }
    ]
  }
];