/**
 * Terminal Commands Handler
 */

import { searchPosts, searchExperience, searchEducation } from '@/lib/search';
import { sections } from './sections';
import type { CommandResult } from '@/types/terminal';

const HELP_MESSAGE = `
Available commands:
  search <terms>          Search across all sections
  blog search <terms>     Search blog posts
  blog list              List all blog posts
  help                   Show this help message

Navigation:
${Object.keys(sections).map(section => 
  `  ${section}`.padEnd(20) + `Go to ${section} page`
).join('\n')}

Examples:
  search investing
  blog search fintech
  experience
`.trim();

export async function handleCommand(input: string): Promise<CommandResult> {
  const [command, ...args] = input.toLowerCase().trim().split(' ');

  // Help command
  if (command === 'help') {
    return {
      results: [{
        input: '',
        output: HELP_MESSAGE
      }]
    };
  }

  // Navigation command
  if (sections[command]) {
    return {
      results: [{
        input: '',
        output: `Navigating to ${command}...`
      }],
      navigation: sections[command]
    };
  }

  // Search commands
  if (command === 'search') {
    const searchTerms = args.join(' ');
    if (!searchTerms) {
      return {
        results: [{
          input: '',
          output: 'Please provide search terms. Example: search investing'
        }]
      };
    }

    const [posts, experience, education] = await Promise.all([
      searchPosts(searchTerms),
      searchExperience(searchTerms),
      searchEducation(searchTerms)
    ]);

    const results = [
      ...posts.map(post => ({
        label: post.title,
        path: `/blog/${post.slug}`
      })),
      ...experience.map(exp => ({
        label: exp.label,
        path: exp.path
      })),
      ...education.map(edu => ({
        label: edu.label,
        path: edu.path
      }))
    ];

    if (results.length === 0) {
      return {
        results: [{
          input: '',
          output: `No results found for "${searchTerms}"`
        }]
      };
    }

    return {
      results: [{
        input: '',
        output: `Found ${results.length} results:`
      }],
      selectionItems: results
    };
  }

  // Blog commands
  if (command === 'blog') {
    const subCommand = args[0];
    const searchTerms = args.slice(1).join(' ');

    if (subCommand === 'search') {
      if (!searchTerms) {
        return {
          results: [{
            input: '',
            output: 'Please provide search terms. Example: blog search investing'
          }]
        };
      }

      const posts = await searchPosts(searchTerms);
      if (posts.length === 0) {
        return {
          results: [{
            input: '',
            output: `No posts found matching "${searchTerms}"`
          }]
        };
      }

      return {
        results: [{
          input: '',
          output: `Found ${posts.length} posts:`
        }],
        selectionItems: posts.map(post => ({
          label: post.title,
          path: `/blog/${post.slug}`
        }))
      };
    }

    if (subCommand === 'list') {
      const posts = await searchPosts('');
      return {
        results: [{
          input: '',
          output: 'All blog posts:'
        }],
        selectionItems: posts.map(post => ({
          label: post.title,
          path: `/blog/${post.slug}`
        }))
      };
    }
  }

  return {
    results: [{
      input: '',
      output: `Command not found. Type 'help' to see available commands.`
    }]
  };
}