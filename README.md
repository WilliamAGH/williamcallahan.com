# William Callahan Portfolio

A modern, performant personal site and blog built with Next.js.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## 🛠 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run validate` - Run both linting and type checking

## 🏗 Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Deployment**: [williamcallahan.com](https://williamcallahan.com)
- **Language**: TypeScript

## 📁 Project Structure

```
.
├── app/                # Next.js app router pages
├── components/         # React components
│   ├── features/      # Feature-specific components
│   └── ui/            # Reusable UI components
├── data/              # Static data and content
├── lib/               # Utility functions and helpers
├── public/            # Static assets
└── types/             # TypeScript type definitions
```

## 🔍 Development Practices

### Code Organization
- Small, focused files with single responsibilities
- Feature-based component organization
- Shared UI components in `components/ui`
- Utility functions in `lib` directory

### TypeScript
- Strict type checking enabled
- Type definitions in `types` directory
- Interface-first development
- Proper type exports/imports

### Documentation
- Clear component documentation with JSDoc
- Inline comments for complex logic
- Type documentation for interfaces
- README files for major features

### Best Practices
- Consistent file naming
- Component composition
- Proper error handling
- Performance optimization
- Accessibility compliance

## 🚀 Deployment

The site is deployed to [williamcallahan.com](https://williamcallahan.com) using Sliplane.io Docker containers:

Push to main branch triggers deployment

## 📦 Dependencies

Main dependencies:
- `next`: ^14.1.0
- `react`: ^18.3.1
- `lucide-react`: ^0.344.0
- `next-themes`: ^0.2.1
- `tailwindcss`: ^3.4.1

Dev dependencies:
- `typescript`: ^5.5.3
- `eslint`: ^8.57.0
- `@types/react`: ^18.3.5