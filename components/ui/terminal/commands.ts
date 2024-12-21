/**
 * Terminal Commands Handler
 */

import { searchPosts, searchExperience, searchEducation, searchInvestments } from '@/lib/search';
import { sections } from './sections';
import type { CommandResult, SearchResult, SelectionItem } from '@/types/terminal';

type SectionKey = keyof typeof sections;

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
  const [rawCommand, ...args] = input.toLowerCase().trim().split(' ');

  // Clear command
  if (rawCommand === 'clear') {
    return {
      results: [],
      shouldClear: true
    };
  }

  // Help command
  if (rawCommand === 'help') {
    return {
      results: [{
        input: '',
        output: HELP_MESSAGE
      }]
    };
  }

  // Section-specific search
  if (rawCommand in sections && args.length > 0) {
    const searchTerms = args.join(' ');
    const command = rawCommand as SectionKey;
    const section = command.charAt(0).toUpperCase() + command.slice(1);
    
    let results: SearchResult[] = [];
    
    switch (command) {
      case 'blog':
        results = await searchPosts(searchTerms);
        break;
      case 'experience':
        results = await searchExperience(searchTerms);
        break;
      case 'education':
        results = await searchEducation(searchTerms);
        break;
      case 'investments':
        results = await searchInvestments(searchTerms);
        break;
      default:
        results = [];
    }

    if (results.length === 0) {
      return {
        results: [{
          input: '',
          output: `No results found in ${section} for "${searchTerms}"`
        }]
      };
    }

    const selectionItems: SelectionItem[] = results.map(result => ({
      label: (result.label ?? result.title) ?? '',
      description: (result.description ?? result.excerpt) ?? '',
      path: result.path ?? `/blog/${result.slug ?? ''}`
    }));

    return {
      results: [{
        input: '',
        output: `Found ${results.length} results in ${section} for "${searchTerms}"`
      }],
      selectionItems
    };
  }

  // Navigation command
  if (rawCommand in sections) {
    const command = rawCommand as SectionKey;
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
