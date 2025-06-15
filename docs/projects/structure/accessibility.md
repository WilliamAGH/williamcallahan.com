# Accessibility Features

**Functionality:** `accessibility`

## Core Objective

To provide reusable components and utilities that enhance the accessibility of the application, ensuring compliance with WCAG standards and improving the user experience for individuals using assistive technologies.

## Features

### 1. Focus Trapping

- **Component:** `components/ui/focusTrap.client.tsx`
- **Responsibility:** To confine keyboard focus within a specific container, such as a modal dialog or an open menu. This prevents users from accidentally tabbing to elements in the background, which can be disorienting.

#### How It Works

See `accessibility.mmd` for a visual diagram of the focus flow.

1. **Activation:** When the `active` prop is `true`, the `FocusTrap` component becomes operational.
2. **Saving Context:** It records the element that was focused right before the trap was activated.
3. **Initial Focus:** It can optionally move focus to the first focusable element within its children.
4. **Trapping Logic:**
    - It uses two invisible, focusable `div` elements (sentinels) at the very beginning and end of its child content.
    - If a user tabs from the last focusable element in the content, the focus lands on the end sentinel. The component detects this and immediately moves focus to the start sentinel, creating a loop.
    - Similarly, `Shift+Tab` from the first element is caught by the start sentinel, which then moves focus to the end sentinel.
5. **Dismissal:** It listens for the `Escape` key and, if pressed, triggers the `onEscape` callback function provided in its props.
6. **Deactivation:** When the `active` prop becomes `false` or the component unmounts, it performs cleanup:
    - Removes its event listeners.
    - Restores focus to the element that was focused before the trap was activated.
    - Restores the body's scrollability.

This component is essential for creating accessible modals, pop-ups, and other overlay UI elements that should command the user's full attention.
