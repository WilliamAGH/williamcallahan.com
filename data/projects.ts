import type { Project } from '@/types/project';

// Remember to update this date whenever the projects data or the Projects page design changes
export const updatedAt = '2025-04-30';

export const projects: Project[] = [
  {
    name: 'aVenture.vc',
    description: 'A new data-driven research platform for the venture capital ecosystem. Track startups, analyze funding trends, and identify opportunities faster.',
    shortSummary: 'Data-driven research platform for the VC ecosystem',
    url: 'https://aventure.vc',
    image: '/images/posts/aventurevc-homepage.png',
    tags: ['Venture Capital', 'Data Platform', 'Startups', 'Funding Trends', 'Research', 'Web App', 'SaaS'],
  },
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
    name: 'SearchAI',
    description: 'A web application that combines traditional web search with an AI-powered chat assistant. Users can perform searches, review selected context from the results, and then engage in a conversation with AI (e.g., OpenAI\'s GPT models, Groq, Gemini, etc.) that utilizes this context to provide more relevant and informed responses.',
    shortSummary: 'AI-powered web search with a contextual chat assistant',
    url: 'https://search-ai.io',
    image: '/images/searchAI.png',
    tags: ['AI', 'Web Search', 'Chat Assistant', 'OpenAI', 'GPT', 'RAG', 'Contextual Search', 'Web App', 'Groq'],
  },
  {
    name: 'Book Finder (findmybook.net)',
    description: 'A Java Spring Boot application that allows users to search for almost any book ever written and receive personalized book recommendations. It integrates with the Google Books API for extensive book data and OpenAI for generating recommendations. The application features a web interface built with Thymeleaf and HTMX, and supports PostgreSQL for data persistence and Spring Session for session management. It includes robust logging and can be deployed via Docker or directly to cloud environments.',
    shortSummary: 'Java-based book search and recommendation engine with OpenAI integration',
    url: 'https://book-recommendation-engine.williamcallahan.com/',
    image: '/images/book-finder-findmybook-net.png',
    tags: ['Java', 'Spring Boot', 'Spring AI', 'OpenAI', 'Google Books API', 'Thymeleaf', 'HTMX', 'PostgreSQL', 'Docker', 'Web App', 'Book Recommendation'],
  },
  {
    name: 'AI Company Research Tool',
    description: 'An experimental web app to retrieve live data from one or more LLMs, parse the JSON response, and display nested/cleaned text for diagnostics in researching companies and competitive intelligence.',
    shortSummary: 'Web app for AI-driven company research',
    url: 'https://company-lookup.iocloudhost.net/',
    image: '/images/company-research-experimental-ai-tool.png',
    tags: ['LLM', 'AI', 'JSON', 'Company Research', 'Web App', 'Experimental'],
  },
];
