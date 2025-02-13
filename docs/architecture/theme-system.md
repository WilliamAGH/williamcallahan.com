# Theme System Architecture

WE ARE NOT ALLOWED TO ADD ANY NEW FEATURES OR FUNCTIONALITY. FIXING THE CURRENT CODE BASE IS THE MANDATE.

## Overview
The theme system follows Next.js 14's Server Components architecture, with server-side theme detection and minimal client-side JavaScript for theme switching. It uses next-themes for client-side theme management while maintaining proper Server/Client Component boundaries.

## Core Principles
1. Server-First Theme Detection
   - Initial theme detection on server
   - Static theme classes in Server Components
   - Minimal client JavaScript

2. Client Boundaries
   - Theme switching isolated to Client Components
   - Clear "use client" directives
   - Proper hydration handling

3. Performance Optimization
   - No theme flashing on load
   - Minimal client bundle
   - Efficient theme persistence

## Core Files

### Server Components
1. Theme Structure
   - `app/layout.tsx` - Root layout with initial theme
   - `app/globals.css` - Theme variables and styles
   - `tailwind.config.js` - Theme configuration

### Client Components
1. Theme Management (`"use client"`)
   - `app/client-components/providers/theme-provider.tsx`
   - `components/ui/theme-toggle.tsx`
   - `app/client-components/theme/theme-initializer.tsx`

2. Theme Integration (`"use client"`)
   - `components/ui/navigation/navigation.client.tsx`
   - `components/ui/terminal/terminal.tsx`

### Test Files
- `__tests__/lib/setup/theme.ts`
- `__tests__/components/ui/theme-toggle.test.tsx`

## Technical Flow

### Server Initialization
1. Static Theme Detection:
```typescript
// app/layout.tsx
import { cookies } from 'next/headers';

export default function RootLayout() {
  const theme = cookies().get('theme')?.value || 'system';
  const systemTheme = 'light'; // Default for SSR

  return (
    <html lang="en" className={theme === 'dark' ? 'dark' : ''}>
      {/* ... */}
    </html>
  );
}
```

2. Client Hydration:
```typescript
// app/client-components/providers/theme-provider.tsx
"use client";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

### Theme Application
1. Server Components:
   - Use static theme classes
   - No client JavaScript
   - Pre-rendered markup

2. Client Components:
   - Theme switching logic
   - System theme detection
   - Theme persistence

## Performance Considerations
1. Server Optimization
   - Static theme detection
   - Pre-rendered theme classes
   - No initial flash

2. Client Optimization
   - Minimal JavaScript
   - Efficient theme switching
   - Proper cleanup

## Testing Requirements
1. Server Testing
   - Initial theme detection
   - Static rendering
   - Cookie handling

2. Client Testing
   - Theme switching
   - System theme sync
   - Persistence

3. Integration Testing
   - Hydration consistency
   - No theme flashing
   - Performance metrics

## Related Documentation
- [State Management Architecture](./state-management.md)
- [Mobile Navigation Architecture](./mobile-navigation.md)
