import type { Project } from '@/types/project';

export const projects: Project[] = [
  {
    name: 'williamcallahan.com',
    description: 'This personal site featuring interactive macOS-style window components (Terminal, Code Blocks, Images) with close/minimize/maximize controls and animations. Includes a lot of dynamic content, an API for fetching investment logos (with refetch/cache logic), MDX blog posts, and more. Built with Next.js App Router, TypeScript, Tailwind CSS, and deployable via Docker across various cloud environments (Vercel, GCP, Oracle Cloud, Hetzner, Railway, Fly.io, etc.).',
    shortSummary: 'Interactive personal site with beautiful terminal/code components & other dynamic content',
    url: 'https://williamcallahan.com',
    image: '/images/williamcallahan-com-project.png',
    tags: ['Next.js', 'TypeScript', 'Tailwind CSS', 'React',  'MDX', 'Server Components'],
  },
  {
    name: 'Filey - Flag Deprecated Files Extension',
    description: 'A VS Code extension (compatible with Cursor, Windsurf, etc.) that visually flags deprecated files based on customizable configuration settings.',
    shortSummary: 'VS Code extension for flagging deprecated files',
    url: '/blog/introducing-flag-deprecated-files-vscode-extension/',
    image: '/images/posts/filey-flag-deprecated-files.png',
    tags: ['VS Code', 'Visual Studio Code', 'Cursor', 'Windsurf', 'TypeScript', 'Files', 'Extension', 'Flag Deprecation','IDE'],
  },
  {
    name: 'AI Company Research Tool',
    description: 'An experimental web app to retrieve live data from one or more LLMs, parse the JSON response, and display nested/cleaned text for diagnostics in researching companies and competitive intelligence.',
    shortSummary: 'Web app for AI-driven company research',
    url: 'https://company-lookup.iocloudhost.net/',
    image: '/images/company-research-experimental-ai-tool.png',
    tags: ['LLM', 'AI', 'JSON', 'Company Research', 'Web App', 'Experimental'],
  },
  // Add more projects here later
];
