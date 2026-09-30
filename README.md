# Web-Based Mind Mapping Canvas

An offline-first, infinite-canvas mind mapping application engineered with Next.js (App Router), @xyflow/react, Tailwind CSS v4, Zustand, and Dexie.js (IndexedDB).

- Live Demo: https://nextjs-reactflow-mindmap.vercel.app
- Repository: https://github.com/mmy-lana/nextjs-reactflow-mindmap

---

## Overview

Web-Based Mind Mapping Canvas provides an infinite grid workspace for structured ideation, technical roadmaps, and hierarchical note-taking. The application runs entirely client-side with zero external cloud dependencies, storing all documents in browser IndexedDB storage with serialized autosave queues and complete JSON/SVG import and export support.

---

## Architectural Highlights

- Modern Graph Engine: Powered by `@xyflow/react` v12 with custom nodes (Root, Branch, Leaf) and bezier curve edges (`OrganicBranchEdge`).
- Pure Layout Engine: Zero-dependency hierarchical positioning algorithms supporting both Horizontal (two-sided branching) and Radial (angular polar tree distribution) layouts.
- Offline-First Persistence: Local database layer managed through Dexie.js with transactional write queues, 400ms edit debounce timers, and immediate flushes on undo/redo operations.
- Undo/Redo Pipeline: 50-entry circular history buffer capturing structural mutations (additions, deletions, drag commits, label renames, and layout passes).
- Graph Invariant Hardening: Traversal routines include cycle detection (`visited` set tracking), single-root enforcement, automatic orphan recovery, and dense sibling index renumbering.
- Secure Export & Serialization: Clean JSON document round-trips with UUID collision regeneration, plus standalone SVG snapshot exports featuring XHTML `<foreignObject>` encapsulation and script attribute stripping.
- Mobile-First Interface: Touch-target compliance (minimum 44x44px hit bounds), bottom action sheets, virtual viewport resize listening (`window.visualViewport`), and auto-centering on active inline text inputs.

---

## Tech Stack

- Framework: Next.js (App Router, Turbopack)
- Graph Runtime: @xyflow/react
- State Management: Zustand
- Client Storage: Dexie.js (IndexedDB)
- Styling: Tailwind CSS v4 (@theme tokens, custom dot-grid CSS)
- Positioning Primitives: @floating-ui/react
- Icons: lucide-react
- Testing: Playwright (Headless Chromium E2E suite)
- Package Manager: pnpm (strict)

---

## Project Structure

```
src/
├── app/
│   ├── globals.css                # Tailwind v4 @theme tokens and canvas grid styles
│   ├── layout.tsx                 # Root HTML shell and metadata
│   ├── page.tsx                   # Document dashboard and map creation
│   └── map/
│       └── [id]/
│           ├── page.tsx           # Route params entry point
│           ├── loading.tsx        # Suspense loading fallback
│           └── MindMapEditor.tsx  # Canvas orchestrator
├── components/
│   ├── canvas/
│   │   ├── CanvasGrid.tsx         # Dot-grid background layer
│   │   ├── MindMapCanvas.tsx      # Core React Flow viewport wrapper
│   │   ├── MinimapOverlay.tsx     # Adaptive dark-theme minimap
│   │   └── ViewportControls.tsx   # Zoom and fit canvas controls
│   ├── nodes/
│   │   ├── RootNode.tsx           # Central concept node (dual-side sources)
│   │   ├── BranchNode.tsx         # Intermediate branch with collapse toggle
│   │   ├── LeafNode.tsx           # Terminal leaf node
│   │   └── parts/
│   │       ├── InlineTextEditor.tsx       # Auto-resizing, keyboard-aware input
│   │       ├── NodeActionsQuickMenu.tsx   # Floating UI contextual action menu
│   │       ├── NodeHandleGroup.tsx        # All-face persistent connection handles
│   │       ├── NodeShell.tsx              # Shared container and touch targets
│   │       └── NodeStatusBadge.tsx        # Visual workflow status chip
│   ├── edges/
│   │   └── OrganicBranchEdge.tsx  # Tapered cubic bezier path renderer
│   ├── panels/
│   │   ├── FloatingToolbar.tsx        # Responsive docked bottom controls
│   │   ├── NodeInspectorDrawer.tsx    # Node/document metadata editor
│   │   ├── MapTreeOutlineDrawer.tsx   # Collapsible hierarchical search list
│   │   ├── LayoutOptionsSheet.tsx     # Spacing sliders and strategy toggle
│   │   ├── ExportImportModal.tsx      # JSON and SVG transfer manager
│   │   └── KeyboardShortcutsModal.tsx # Shortcut reference sheet
│   └── ui/
│       ├── ActionSheet.tsx        # Bottom sheet / desktop card dialog
│       ├── Button.tsx             # Touch-first styled button
│       ├── Drawer.tsx             # Responsive slide-in drawer
│       ├── Dropdown.tsx           # Accessible action popover
│       ├── IconButton.tsx         # Fixed 44px icon container
│       └── Modal.tsx              # Focus-trapped dialog
├── db/
│   ├── schema.ts                  # SSR-safe Dexie database declaration
│   └── documentRepository.ts      # Validated storage CRUD and title resolvers
├── hooks/
│   ├── useCanvasHistory.ts        # Undo/redo availability and labels
│   ├── useKeyboardNavigation.ts   # Global keyboard shortcut dispatcher
│   ├── useMindMapLayout.ts        # Layout tuning and execution hooks
│   ├── useNodeOperations.ts       # Contextual node mutation accessors
│   ├── useOverlayA11y.ts          # Focus trapping and scroll-lock management
│   └── useVisualViewport.ts       # Virtual keyboard tracking
├── lib/
│   ├── cn.ts                      # Class name composition
│   ├── exportEngine.ts            # JSON validation and SVG serializer
│   ├── focusable.ts               # Tab-order utilities
│   ├── layoutEngine.ts            # Pure horizontal and radial layout algorithms
│   ├── nodeFactory.ts             # Node and edge entity generators
│   └── treeTransforms.ts          # Graph repair, cycle guards, traversal
└── types/
    └── mindmap.ts                 # Pure TypeScript domain models and guards
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
git clone https://github.com/mmy-lana/nextjs-reactflow-mindmap.git
cd nextjs-reactflow-mindmap
pnpm install
```

### Development Server

Run the development server with Turbopack:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
pnpm build
pnpm start
```

### Type Checking & E2E Testing

```bash
# TypeScript verification
pnpm typecheck

# Headless Playwright test suite
pnpm exec playwright test --project=desktop
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Tab` | Add child to selected node |
| `Mod + Enter` | Add sibling to selected node |
| `Mod + Shift + Enter` | Add branch directly to root node |
| `Delete` / `Backspace` | Delete selected node and its subtree |
| `Space` | Toggle collapse/expand on branch |
| `F2` | Rename selected node |
| `Up Arrow` | Navigate to parent node |
| `Down Arrow` | Navigate to first child node |
| `Mod + Z` | Undo last mutation |
| `Mod + Shift + Z` | Redo last undone mutation |
| `Mod + 0` | Fit whole map into viewport |
| `Mod + I` | Toggle Node Inspector drawer |
| `Mod + O` | Toggle Map Outline drawer |
| `?` | Show keyboard shortcuts sheet |

*Note: On macOS, `Mod` corresponds to `Command (⌘)`; on Windows/Linux, it corresponds to `Ctrl`.*

---

## License

MIT
