# macOS GUI Architecture Map

## Overview

The "macos-gui" functionality encompasses components that emulate the macOS operating system's graphical user interface style. These components provide a familiar windowed environment for various UI elements within the application.

## Key Files and Responsibilities

- **instruction-macos-frame-tabs.client.tsx**: Provides macOS-style tabs specifically for instructional content, enhancing the visual presentation of step-by-step guides.
- **macos-window.client.tsx**: Contains two components:
  - **MacOSWindow**: A general-purpose wrapper that renders a macOS-style window with customizable title, tabs, and window controls (traffic lights). It supports interactive tab navigation and window state management.
  - **MacOSCodeWindow**: A specialized variant for displaying code content within a macOS window frame, integrating with the `CodeBlock` component for syntax highlighting and formatting.
- **window-controls.tsx**: Renders macOS-style window controls (close, minimize, maximize buttons) used in various window components, with configurable handlers for window state changes.

## Logic Flow and Interactions

- **MacOSWindow** serves as a container for other UI elements, applying a macOS window frame with optional tabs and controls. It relies on hooks from the `state-theme-window-providers` functionality to manage its state (e.g., normal, minimized, maximized).
- **instruction-macos-frame-tabs.client.tsx** uses the `CollapseDropdown` component from the `interactive-containers` functionality to manage content visibility within the tabs.
- **MacOSCodeWindow** extends the window frame concept specifically for code, ensuring proper rendering and styling of code snippets within the macOS aesthetic.
- **window-controls.tsx** and **instruction-macos-frame-tabs.client.tsx** provide modular UI elements that integrate with window components to complete the macOS GUI experience.

## Notes

- These components are crucial for maintaining a consistent macOS-like user interface across different parts of the application, enhancing visual appeal and user familiarity.
- They are reused in various contexts, such as instructional content and code displays, ensuring a cohesive look and feel.

## Architecture and File Interaction

The system is composed of three key components that build upon each other to provide layered functionality. See `macos-gui.mmd` for a visual diagram of the component hierarchy.

### 1. `components/ui/navigation/window-controls.tsx` (Low-Level)

- **Responsibility:** Renders the classic macOS "traffic light" buttons (close, minimize, maximize/restore).
