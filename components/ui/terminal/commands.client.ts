/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import { searchPosts, searchExperience, searchEducation, searchInvestments } from '@/lib/search';
import { sections, type SectionKey } from './sections';
import type { CommandResult, SearchResult } from '@/types/terminal';

export const terminalCommands = {
  home: '/',
  investments: '/investments',
  experience: '/experience',
  skills: '/skills',
  blog: '/blog',
  aventure: '/experience#aventure',
  tsbank: '/experience#tsbank',
  seekinvest: '/experience#seekinvest',
  'callahan-financial': '/experience#callahan-financial',
  'mutual-first': '/experience#mutual-first',
  morningstar: '/experience#morningstar'
} as const;

const HELP_MESSAGE = `
Available commands:
  help                Show this help message
  clear              Clear terminal history

Navigation:
  home               Go to home page
  investments        Go to investments page
  experience         Go to experience page
  education          Go to education page
  blog               Go to blog page

Search:
  <section> <terms>  Search within a section
                     Example: investments fintech

Examples:
  investments fintech
  experience 2020
  blog investing
  clear
`.trim();

export async function handleCommand(input: string): Promise<CommandResult> {
  const [command, ...args] = input.toLowerCase().trim().split(' ');

  // Clear command
  if (command === 'clear') {
    return {
      results: [],
      clear: true
    };
  }

  // Help command
  if (command === 'help') {
    return {
      results: [{
        input: '',
        output: HELP_MESSAGE
      }]
    };
  }

  // Type guard for valid section
  const isValidSection = (section: string): section is SectionKey => {
    return section in sections;
  };

  // Section-specific search
  if (isValidSection(command) && args.length > 0) {
    const searchTerms = args.join(' ');
    const section = command.charAt(0).toUpperCase() + command.slice(1);

    let results: SearchResult[] = [];

    switch (command) {
      case 'blog': {
        const posts = await searchPosts(searchTerms);
        results = posts.map(post => ({
          label: post.title,
          description: post.excerpt,
          path: `/blog/${post.slug}`
        }));
        break;
      }
      case 'experience':
        results = await searchExperience(searchTerms);
        break;
      case 'education':
        results = await searchEducation(searchTerms);
        break;
      case 'investments':
        results = await searchInvestments(searchTerms);
        break;
    }

    if (results.length === 0) {
      return {
        results: [{
          input: '',
          output: `No results found in ${section} for "${searchTerms}"`
        }]
      };
    }

    return {
      results: [{
        input: '',
        output: `Found ${results.length} results in ${section} for "${searchTerms}"`
      }],
      selectionItems: results
    };
  }

  // Navigation command
  if (isValidSection(command)) {
    return {
      results: [{
        input: '',
        output: `Navigating to ${command}...`
      }],
      navigation: sections[command]
    };
  }

  return {
    results: [{
      input: '',
      output: `Command not recognized. Type "help" for available commands.`
    }]
  };
}