import type { Project } from '@/types/project';

export const projects: Project[] = [
  {
    name: 'williamcallahan.com',
    description: 'My personal site featuring an interactive terminal, dynamic OG images, API for fetching of logo images for investments (with refetch/cache logic), MDX blog posts, and more. Built with Next.js App Router, TypeScript, Tailwind CSS, and deployable in any Docker hosted container, tested across cloud environments (e.g., Vercel, GCP, Oracle Cloud, Hetzner, Railway, Fly.io, and on personal servers).',
    url: 'https://williamcallahan.com',
    image: '/images/williamcallahan-com-project.png',
    tags: ['Next.js', 'TypeScript', 'Tailwind CSS', 'React',  'MDX', 'Server Components'],
  },
  // Add more projects here later
];
