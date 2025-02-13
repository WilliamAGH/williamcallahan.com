# Mobile Navigation Architecture

WE ARE NOT ALLOWED TO ADD ANY NEW FEATURES OR FUNCTIONALITY. FIXING THE CURRENT CODE BASE IS THE MANDATE.

## Overview
The mobile navigation system follows Next.js 14's hybrid architecture, using Server Components for static structure and Client Components for interactive features. This approach minimizes client-side JavaScript while maintaining a responsive, accessible touch experience.

## Core Principles
1. Server-First Rendering
   - Navigation structure as Server Components
   - Static content pre-rendered
   - Minimal client JavaScript

2. Client Boundaries
   - Interactive features marked with "use client"
   - Touch handlers isolated to client
   - State contained to interactive parts

3. Performance Focus
   - Streaming enabled for large content
   - Minimal client bundle size
   - Optimized hydration

## Core Files

### Server Components
1. Navigation Structure
   - `app/layout.tsx` - Root layout
   - `components/ui/navigation/navigation.server.tsx` - Static structure
   - `types/navigation.ts` - Shared types

### Client Components
1. Interactive Features (`"use client"`)
   - `components/ui/navigation/navigation.client.tsx` - Mobile menu
   - `components/ui/navigation/navigation-link.tsx` - Interactive links
   - `lib/hooks/useTouchHandler.ts` - Touch handling

2. Focus Management (`"use client"`)
   - `components/ui/focus-trap.tsx` - Focus control

### Direct Dependencies
1. Navigation Components
   - `components/ui/navigation/navigation.tsx` - Main navigation component
   - `components/ui/navigation/navigation-links.ts` - Navigation link definitions
   - `components/ui/navigation/window-controls.tsx` - Window control buttons

2. Touch Handling
   - `lib/utils.ts` - Utility functions including debounce

### Indirect Dependencies
1. Theme Integration
   - `app/client-components/theme/theme-init.ts` - Theme initialization
   - `app/client-components/providers/theme-provider.tsx` - Theme provider
   - `components/ui/theme-toggle.tsx` - Theme toggle component

### Test Files
- `__tests__/components/ui/navigation/navigation.test.tsx`
- `__tests__/components/ui/navigation/navigation-link.test.tsx`
- `__tests__/lib/setup/theme.ts` (for dark mode overlay testing)

## Technical Flow

### Initialization Flow
1. Navigation component mounts in layout
2. Touch handler initialized with:
   - Swipe detection
   - Scroll prevention when menu open
   - RTL support
   - Reduced motion handling

### State Management
1. Menu State:
   ```typescript
   const [isMenuOpen, setIsMenuOpen] = useState(false);
   const [isTransitioning, setIsTransitioning] = useState(false);
   const [shouldRender, setShouldRender] = useState(false);
   ```

2. Cleanup & Event Handlers:
   ```typescript
   useEffect(() => {
     const handleEscape = (e: KeyboardEvent) => {
       if (e.key === 'Escape') closeMenu();
     };
     if (isMenuOpen) {
       document.addEventListener('keydown', handleEscape);
     }
     return () => document.removeEventListener('keydown', handleEscape);
   }, [isMenuOpen, closeMenu]);
   ```

### Touch Handling
1. Gesture Detection:
   ```typescript
   const { touchHandlers } = useTouchHandler({
     onSwipe: (direction) => {
       if (direction === 'left' && isMenuOpen) closeMenu();
     },
     threshold: 70,
     preventScroll: isMenuOpen,
     disabled: !isMenuOpen
   });
   ```

2. Event Propagation:
   - Touch events properly contained within menu
   - Scroll prevention when menu open
   - Proper cleanup on unmount

## Usage Examples

### Blog Navigation Implementation
File: `app/blog/page.tsx`
```typescript
import { Navigation } from '@/components/ui/navigation/navigation';

export default function BlogPage() {
  return (
    <>
      <Navigation />
      {/* Blog content */}
    </>
  );
}
```

### Experience Page Navigation
File: `app/experience/page.tsx`
```typescript
import { Navigation } from '@/components/ui/navigation/navigation';

export default function ExperiencePage() {
  return (
    <>
      <Navigation />
      {/* Experience content */}
    </>
  );
}
```

## Current Issues & Potential Problems

### State Management
1. Race Conditions
   - Menu state updates during transitions
   - Touch event handling during animations
   - Solution: State machine implementation needed

2. Memory Leaks
   - Event listener cleanup timing
   - Animation frame cancellation
   - Solution: Enhanced cleanup in useEffect

### Performance
1. Animation Performance
   - Transform animations on low-end devices
   - Solution: Hardware acceleration flags

2. Touch Response
   - Debounce timing on different devices
   - Solution: Adaptive debounce based on device capability

### Browser Compatibility
1. Safari Issues
   - Touch event differences
   - Solution: Safari-specific touch delay (300ms)

2. RTL Support
   - Transform origin in RTL mode
   - Solution: Dynamic transform origin based on dir attribute

## Performance Considerations
1. Animation Performance
   - Use transform instead of position properties
   - Hardware acceleration for smooth animations
   - Reduced motion support

2. Touch Response
   - Debounced touch move events
   - Proper touch target sizes
   - Efficient event cleanup

3. Memory Management
   - Proper event listener cleanup
   - Animation frame cancellation
   - State cleanup on unmount

## Testing Requirements
1. Unit Tests
   - Navigation component rendering
   - Link behavior verification
   - State management validation

2. Integration Tests
   - Touch event handling
   - Focus management
   - Theme integration

3. Accessibility Tests
   - Screen reader compatibility
   - Keyboard navigation
   - ARIA attribute verification

## Related Documentation
- [State Management Architecture](./state-management.md)
- [Theme System Architecture](./theme-system.md)
