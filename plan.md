# Specification Plan: Web-Based Mind Mapping Canvas (`nextjs-reactflow-mindmap`)

## 1. Data Schema & Pure TypeScript Interfaces

```typescript
// types/mindmap.ts
import type { Node, Edge } from '@xyflow/react';

export type NodeDepth = number;
export type NodeDirection = 'LEFT' | 'RIGHT' | 'CENTER';
export type NodeStatus = 'IDEA' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type ActiveDrawerType = 'inspector' | 'outline' | null;

export interface NodeStyleConfig {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold';
  shape: 'rounded' | 'rectangle' | 'pill' | 'underline';
}

export const DEFAULT_NODE_STYLE: Readonly<NodeStyleConfig> = {
  backgroundColor: '#15171a',
  borderColor: '#282c34',
  borderWidth: 1,
  textColor: '#f3f4f6',
  fontSize: 14,
  fontWeight: 'medium',
  shape: 'rounded',
};

export const DEFAULT_EDGE_DATA: Readonly<MindMapEdgeData> = {
  branchColor: '#6366f1',
  strokeWidth: 2,
  dashed: false,
};

export interface MindMapNodeData extends Record<string, unknown> {
  label: string;
  notes?: string;
  depth: NodeDepth;
  direction: NodeDirection;
  order: number;
  status?: NodeStatus;
  isCollapsed?: boolean;
  childCount: number;
  tags: string[];
  style: NodeStyleConfig;
  parentId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MindMapEdgeData extends Record<string, unknown> {
  branchColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  label?: string;
}

export type CanvasNode = Node<MindMapNodeData, 'root' | 'branch' | 'leaf'>;
export type CanvasEdge = Edge<MindMapEdgeData, 'organic'>;

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface MindMapDocument {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
  viewport: ViewportState;
  tags: string[];
}

export interface MindMapExportPayload {
  version: string;
  meta: MindMapDocument;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface LayoutOptions {
  horizontalSpacing: number;
  verticalSpacing: number;
  direction: 'HORIZONTAL' | 'RADIAL';
}

export interface HistoryEntry {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  description: string;
  timestamp: number;
}
```

```typescript
// db/schema.ts
import Dexie, { type Table } from 'dexie';
import type { MindMapDocument, MindMapExportPayload } from '@/types/mindmap';

export interface LocalDocumentRecord extends MindMapDocument {
  data: MindMapExportPayload;
}

export interface AppPreferencesRecord {
  key: string;
  value: string | number | boolean | object;
}

export class MindMapDatabase extends Dexie {
  documents!: Table<LocalDocumentRecord, string>;
  preferences!: Table<AppPreferencesRecord, string>;

  constructor() {
    super('MindMapCanvasDB');
    this.version(1).stores({
      documents: 'id, title, createdAt, updatedAt, *tags',
      preferences: 'key',
    });
  }
}

let _dbInstance: MindMapDatabase | null = null;

export function getDB(): MindMapDatabase {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB cannot be accessed during server-side execution.');
  }
  if (!_dbInstance) {
    _dbInstance = new MindMapDatabase();
  }
  return _dbInstance;
}
```

---

## 2. Component Architecture & "use client" Directives

All interactive canvas components, custom nodes, drawers, and stateful hooks must explicitly declare `"use client"` at the top of the file to adhere to Next.js App Router boundaries.

```
src/
├── app/
│   ├── globals.css                # Tailwind v4 @theme declarations and custom grid tokens
│   ├── layout.tsx                 # Server component shell
│   ├── page.tsx                   # Server landing component with dashboard list
│   └── map/
│       └── [id]/
│           ├── page.tsx           # Server wrapper with dynamic params
│           └── MindMapEditor.tsx  # "use client" interactive client orchestrator
├── components/
│   ├── canvas/
│   │   ├── MindMapCanvas.tsx      # "use client": Canvas wrapper importing from @xyflow/react
│   │   ├── CanvasGrid.tsx         # "use client": Background grid wrapper
│   │   ├── MinimapOverlay.tsx     # "use client": MiniMap wrapper from @xyflow/react
│   │   └── ViewportControls.tsx   # "use client": Floating controls
│   ├── nodes/
│   │   ├── RootNode.tsx           # "use client": Type 'root'
│   │   ├── BranchNode.tsx         # "use client": Type 'branch'
│   │   ├── LeafNode.tsx           # "use client": Type 'leaf'
│   │   └── parts/
│   │       ├── NodeHandleGroup.tsx
│   │       ├── NodeActionsQuickMenu.tsx # "use client": Floating UI positioned quick actions
│   │       ├── NodeStatusBadge.tsx
│   │       └── InlineTextEditor.tsx     # "use client": Input synced with virtualKeyboard
│   ├── edges/
│   │   └── OrganicBranchEdge.tsx  # "use client": Type 'organic' with smooth SVG paths
│   ├── panels/
│   │   ├── FloatingToolbar.tsx    # "use client": Bottom toolbar with mobile overflow sheet
│   │   ├── NodeInspectorDrawer.tsx# "use client": Drawer (inspector)
│   │   ├── MapTreeOutlineDrawer.tsx# "use client": Drawer (tree outline)
│   │   ├── ExportImportModal.tsx  # "use client": Dialog
│   │   └── KeyboardShortcutsModal.tsx # "use client": Dialog
│   └── ui/
│       ├── Button.tsx
│       ├── IconButton.tsx
│       ├── Dropdown.tsx
│       ├── Modal.tsx              # "use client": Accessible dialog with focus trap
│       └── Drawer.tsx             # "use client": Touch-first sheet and desktop side-drawer
├── hooks/
│   ├── useCanvasHistory.ts        # "use client"
│   ├── useMindMapLayout.ts        # "use client"
│   ├── useNodeOperations.ts       # "use client"
│   ├── useVisualViewport.ts       # "use client": Track keyboard and window dimensions
│   └── useKeyboardNavigation.ts   # "use client"
├── store/
│   └── useMindMapStore.ts         # "use client": Zustand store with debounced Dexie write
└── lib/
    ├── layoutEngine.ts            # PURE MODULE: Zero store dependencies
    ├── exportEngine.ts            # Pure import/export with ID collision resolution
    └── treeTransforms.ts          # Pure graph traversal with cycle prevention
```

### CSS and Token Configuration (Tailwind v4 `@theme`)
No legacy `tailwind.config.js` is used. All styles are defined directly in `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-canvas-bg: #0c0d0e;
  --color-node-surface: #15171a;
  --color-node-surface-hover: #1c1f24;
  --color-node-border: #282c34;
  --color-node-border-active: #6366f1;
  --color-canvas-text: #f3f4f6;
  --color-canvas-muted: #9ca3af;
  --color-canvas-dot: rgba(255, 255, 255, 0.08);

  --spacing-touch-target: 44px;
}
```

---

## 3. Core Feature Logic

### 3.1 Pure Layout Engine (`src/lib/layoutEngine.ts`)
Strict architectural isolation: this module imports only structural types (`CanvasNode`, `CanvasEdge`, `LayoutOptions`) and never calls Zustand hooks or store actions.
1. Root node sits fixed at `(0, 0)`.
2. First-generation branches divide by their `.direction` field or are sorted by their `.order` field:
   - Nodes with direction `'RIGHT'` (or even index order) calculate along the positive X axis.
   - Nodes with direction `'LEFT'` (or odd index order) calculate along the negative X axis.
3. Subtree bounding height uses dynamic recursive calculation:
   - For leaf nodes: height is the measured node height (default 44px).
   - For parent nodes:
     $$H_{\text{subtree}} = \max\left(H_{\text{node}}, \sum_{i} H_{\text{child}_{i}} + \text{verticalSpacing} \cdot (N - 1)\right)$$
4. Sibling vertical coordinates align sequentially based on their `order` value, centering the total subtree block against the parent node's vertical center.

### 3.2 Cycle-Guarded Graph Traversal (`src/lib/treeTransforms.ts`)
To prevent infinite stack overflows from corrupted maps or invalid edits:

```typescript
export function collectDescendants(
  nodeId: string,
  edges: CanvasEdge[],
  visited: Set<string> = new Set<string>()
): string[] {
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const directChildren = edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.target);

  const allDescendants: string[] = [...directChildren];
  for (const childId of directChildren) {
    if (!visited.has(childId)) {
      allDescendants.push(...collectDescendants(childId, edges, visited));
    }
  }

  return allDescendants;
}
```

### 3.3 Root Protection in Deletion
`deleteSubtree(nodeId)` must strictly verify that the target node is not the root node before applying state changes:

```typescript
if (nodeId === rootNodeId || node.data.depth === 0) {
  return; // Prevent root node removal
}
```

### 3.4 Debounced & Serialized Persistence Queue with Immediate Flush
To avoid race conditions, stale overwrite of undone states, and database corruption:
1. State changes update memory instantly inside the Zustand store.
2. Keystroke/drag mutations trigger `scheduleDebouncedSave(payload)` with a 400ms timer.
3. Every new mutation resets any pending timer via `clearTimeout`.
4. `undo()` and `redo()` cancel pending debounce timers and invoke `flushImmediateSave(payload)` directly to prevent older edits from stomping restored state.
5. All physical writes execute sequentially through a single serialized promise queue.

```typescript
let saveQueue = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function executeSerializedWrite(payload: MindMapExportPayload): Promise<void> {
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const db = getDB();
      await db.documents.put({
        ...payload.meta,
        updatedAt: Date.now(),
        data: payload,
      });
    });
  return saveQueue;
}

export function cancelPendingSave(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export function scheduleDebouncedSave(payload: MindMapExportPayload, delayMs = 400): void {
  cancelPendingSave();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void executeSerializedWrite(payload);
  }, delayMs);
}

export function flushImmediateSave(payload: MindMapExportPayload): Promise<void> {
  cancelPendingSave();
  return executeSerializedWrite(payload);
}
```

### 3.5 Import ID Collision Remapping (`src/lib/exportEngine.ts`)
To prevent existing canvas nodes from being overwritten when importing external JSON files:
1. Parse imported document payload.
2. Initialize an ID map: `const idMap = new Map<string, string>()`.
3. For every node, generate `const newId = crypto.randomUUID()`, recording `idMap.set(node.id, newId)`.
4. Remap node records, safely guarding the root node's `parentId: null` against strict map lookups:
   ```typescript
   const remappedNodes: CanvasNode[] = nodes.map((node) => {
     const mappedParentId = node.data.parentId
       ? idMap.get(node.data.parentId) ?? null
       : null;

     return {
       ...node,
       id: idMap.get(node.id) ?? crypto.randomUUID(),
       data: {
         ...node.data,
         parentId: mappedParentId,
       },
     };
   });
   ```
5. Update and validate every edge, dropping orphan references whose endpoints are absent from the node set:
   ```typescript
   const remappedEdges: CanvasEdge[] = edges
     .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
     .map((edge) => ({
       ...edge,
       id: crypto.randomUUID(),
       source: idMap.get(edge.source)!,
       target: idMap.get(edge.target)!,
     }));
   ```

### 3.6 Mobile Viewport & Virtual Keyboard Integration
- `useVisualViewport`: Uses `window.visualViewport` resize and scroll listeners. When keyboard opens (`visualViewport.height < window.innerHeight - 100`), set state flag `isKeyboardOpen = true`.
- When `isKeyboardOpen === true`, hide bottom floating toolbars to avoid occlusion, and trigger `@xyflow/react` `setCenter(node.position.x, node.position.y, { duration: 300 })` to ensure the edited node remains visible.
- `activeDrawer`: Controlled via a single exclusive union `activeDrawer: 'inspector' | 'outline' | null` to prevent dual drawer collisions on narrow viewports.
- `NodeActionsQuickMenu`: Positioned using `@floating-ui/react` with `flip()` and `shift({ padding: 12 })` to prevent clipping at canvas viewport edges.

---

## 4. 5-Phase Sequential Implementation Queue

### Phase 1: Types, Storage/API Client Config, and Base Utilities

#### Step 1.1: Core Types & Constants
- Create `src/types/mindmap.ts` using types imported directly from `@xyflow/react`.
- Define `DEFAULT_NODE_STYLE`, `MindMapNodeData`, `MindMapEdgeData`, `CanvasNode`, `CanvasEdge`, and `ActiveDrawerType`.

#### Step 1.2: Lazy-Initialized Dexie Storage
- Create `src/db/schema.ts` with `getDB()` factory guarding against SSR execution.
- Implement storage accessors in `src/db/documentRepository.ts`:
  - `createDocument(title: string): Promise<string>`
  - `getDocument(id: string): Promise<LocalDocumentRecord | undefined>`
  - `saveDocumentSerialized(id: string, payload: MindMapExportPayload): Promise<void>`
  - `deleteDocument(id: string): Promise<void>`
  - `listDocuments(): Promise<MindMapDocument[]>`

#### Step 1.3: Graph Traversal & Transform Utilities
- Create `src/lib/treeTransforms.ts`:
  - Implement `collectDescendants(nodeId, edges, visited)` with cycle detection.
  - Implement `calculateNodeOrder(siblings: CanvasNode[]): number`.
  - Implement `findRootNode(nodes: CanvasNode[]): CanvasNode | undefined`.

#### Step 1.4: Pure Layout Engine Module
- Create `src/lib/layoutEngine.ts` with no store imports:
  - Implement `calculateMindMapLayout(nodes: CanvasNode[], edges: CanvasEdge[], options: LayoutOptions): { nodes: CanvasNode[]; edges: CanvasEdge[] }`.
  - Compute subtree bounds respecting sibling `order` and `direction`.

---

### Phase 2: Design Foundation & Atomic UI Primitives

#### Step 2.1: Canvas Theme Tokens & CSS Base
- Configure `src/app/globals.css` with `@theme` block matching the dark infinite-canvas aesthetic.
- Define utility classes for dot-grid background rendering and high-contrast focus rings.

#### Step 2.2: Touch-First Base Primitives
- Create accessible components in `src/components/ui/`:
  - Add `"use client";` as the first line of `Modal.tsx` and `Drawer.tsx` to ensure client-side execution for state and focus-trap logic.
  - `Button.tsx`: Supports variants (primary, secondary, danger) with minimum 44px tap area.
  - `IconButton.tsx`: 44px x 44px container containing SVG icon.
  - `Modal.tsx`: Accessible dialog with focus trapping, backdrop click-dismiss, and ESC key binding.
  - `Drawer.tsx`: Sliding panel supporting mobile bottom-sheet and desktop side-drawer modes.

---

### Phase 3: Custom Flow Elements & Canvas Molecules

#### Step 3.1: Custom ReactFlow Nodes (`@xyflow/react`)
- Create `src/components/nodes/RootNode.tsx`:
  - Centered origin node with left and right connection handles (`Handle` from `@xyflow/react`).
  - Supports inline title editing.
- Create `src/components/nodes/BranchNode.tsx`:
  - Source and target handles dynamically positioned according to node `direction`.
  - Displays subtree toggle handle when `childCount > 0`.
- Create `src/components/nodes/LeafNode.tsx`:
  - Compact node with target handle and inline editable label.
- Create `src/components/nodes/parts/NodeActionsQuickMenu.tsx`:
  - Positioned via `@floating-ui/react` with `flip()` and `shift()` to eliminate viewport edge clipping.
  - Controls: Add Child, Add Sibling, Change Status, Delete Node.

#### Step 3.2: Custom Smooth Curvature Edge
- Create `src/components/edges/OrganicBranchEdge.tsx`:
  - Uses `getBezierPath` from `@xyflow/react` to render smooth lines with branch-depth color scaling.

#### Step 3.3: Canvas Viewport Overlays
- Create `src/components/canvas/CanvasGrid.tsx` with `<Background variant={BackgroundVariant.Dots} />`.
- Create `src/components/canvas/MinimapOverlay.tsx` utilizing `<MiniMap />`:
  - Default visibility: `isMinimapOpen = false` on screen widths `<430px` to prevent occlusion with floating tools; defaults to `true` on `>=768px`.
  - Toggled dynamically via the mobile overflow bottom sheet.
- Create `src/components/canvas/ViewportControls.tsx` utilizing `<Controls />` styled for touch targets.

---

### Phase 4: Domain Logic, Reactive State, and Specialized APIs

#### Step 4.1: Reactive Zustand Canvas Store
- Create `src/store/useMindMapStore.ts`:
  - Store State Shape:
    - `documentId: string | null`
    - `meta: MindMapDocument | null` (hydrated during `loadDocument`)
    - `nodes: CanvasNode[]`
    - `edges: CanvasEdge[]`
    - `selectedNodeId: string | null`
    - `history: HistoryEntry[]`
    - `historyIndex: number`
    - `isLayoutRunning: boolean`
    - `activeDrawer: ActiveDrawerType`
  - Uses `DEFAULT_NODE_STYLE` when generating nodes.
  - Guards against root deletion (`nodeId === rootId` early-return).
  - Explicit generic parameterization for Flow change handlers:
    ```typescript
		onNodesChange: (changes: NodeChange<CanvasNode>[]) => {
			set({
				nodes: applyNodeChanges<CanvasNode>(changes, get().nodes),
			});
			const dragCommitted = changes.some(
				(c) => c.type === 'position' && c.dragging === false
			);
			if (dragCommitted) {
				get().pushHistorySnapshot('Move Node');
			}
			get().scheduleSave();
		},
    onConnect: (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: CanvasEdge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
        type: 'organic',
        data: { ...DEFAULT_EDGE_DATA },
      };
      set({ edges: [...get().edges, newEdge] });
      get().pushHistorySnapshot('Connect Branch');
      get().scheduleSave();
    },
    ```
  - History Snapshot Pipeline (50-entry circular ceiling):
    ```typescript
    pushHistorySnapshot: (description: string) => {
      const { history, historyIndex, nodes, edges } = get();
      const truncated = history.slice(0, historyIndex + 1);
      const nextEntry: HistoryEntry = {
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        description,
        timestamp: Date.now(),
      };
      const MAX_HISTORY = 50;
      const nextHistory =
        truncated.length >= MAX_HISTORY
          ? [...truncated.slice(truncated.length - MAX_HISTORY + 1), nextEntry]
          : [...truncated, nextEntry];

      set({
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
      });
    },
    ```
  - Mutation Persistence & Snapshot Rules:
    Every domain mutation (`addNode`, `updateNodeLabel`, `deleteSubtree`, `toggleSubtreeCollapse`, `applyLayout`) must explicitly terminate with:
    ```typescript
    get().pushHistorySnapshot(actionDescription);
    get().scheduleSave();
    ```
  - Persistence Store Actions:
    ```typescript
    scheduleSave: () => {
      const { meta, nodes, edges } = get();
      if (!meta) return;
      scheduleDebouncedSave({ version: '1.0.0', meta, nodes, edges });
    },
    flushSave: async () => {
      const { meta, nodes, edges } = get();
      if (!meta) return;
      await flushImmediateSave({ version: '1.0.0', meta, nodes, edges });
    },
    ```
  - Undo and Redo Execution Sequence (reverts store state first, then flushes immediately):
    ```typescript
    undo: async () => {
      const { historyIndex, history } = get();
      if (historyIndex <= 0) return;
      cancelPendingSave();
      const nextIndex = historyIndex - 1;
      const targetState = history[nextIndex];
      set({
        nodes: targetState.nodes,
        edges: targetState.edges,
        historyIndex: nextIndex,
      });
      await get().flushSave();
    },
    redo: async () => {
      const { historyIndex, history } = get();
      if (historyIndex >= history.length - 1) return;
      cancelPendingSave();
      const nextIndex = historyIndex + 1;
      const targetState = history[nextIndex];
      set({
        nodes: targetState.nodes,
        edges: targetState.edges,
        historyIndex: nextIndex,
      });
      await get().flushSave();
    },
    ```
  - Complete Actions Interface:
    - `onNodesChange: (changes: NodeChange<CanvasNode>[]) => void`
    - `onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void`
    - `onConnect: (connection: Connection) => void`
    - `pushHistorySnapshot: (description: string) => void`
    - `scheduleSave: () => void`
    - `flushSave: () => Promise<void>`
    - `addNode: (parentId: string, direction?: NodeDirection) => void`
    - `updateNodeLabel: (id: string, label: string) => void`
    - `deleteSubtree: (nodeId: string) => void`
    - `toggleSubtreeCollapse: (nodeId: string) => void`
    - `applyLayout: () => void`
    - `undo: () => Promise<void>`
    - `redo: () => Promise<void>`
    - `setActiveDrawer: (drawer: ActiveDrawerType) => void`

#### Step 4.2: Mobile Viewport & Virtual Keyboard Integration
- Create `src/hooks/useVisualViewport.ts`:
  - Subscribes to `window.visualViewport` resize/scroll events.
  - Emits keyboard visibility and viewport height for UI adaptation.
- Update `src/components/nodes/parts/InlineTextEditor.tsx`:
  - Centers active node via `@xyflow/react` `useReactFlow().setCenter` on focus.

#### Step 4.3: Export Engine & ID Remapping
- Create `src/lib/exportEngine.ts`:
  - `exportToJson(nodes: CanvasNode[], edges: CanvasEdge[], meta: MindMapDocument): string`.
  - `importFromJson(jsonString: string): { nodes: CanvasNode[]; edges: CanvasEdge[] }` with UUID regeneration and ID remapping to prevent database collisions.
  - `exportToSvg(containerElement: HTMLElement): Promise<string>`.

---

### Phase 5: Complete Page Assembly & Responsive Shell

#### Step 5.1: Responsive Bottom Floating Toolbar
- Create `src/components/panels/FloatingToolbar.tsx`:
  - Adapts to mobile widths (360px - 430px): Renders maximum 4 primary actions (Add Node, Layout, Undo, More).
  - Overflow button triggers bottom action sheet for remaining secondary actions (Redo, Fit View, Export).
  - Automatically hidden when `isKeyboardOpen === true`.

#### Step 5.2: Drawers & Modals Assembly
- Create `src/components/panels/NodeInspectorDrawer.tsx` (connected to `activeDrawer === 'inspector'`).
- Create `src/components/panels/MapTreeOutlineDrawer.tsx` (connected to `activeDrawer === 'outline'`).
- Create `src/components/panels/ExportImportModal.tsx`.

#### Step 5.3: Main Editor Screen Integration
- Create `src/app/map/[id]/MindMapEditor.tsx` declaring `"use client"`:
  - Hoists node and edge type definitions outside component scope as immutable constants to avoid continuous re-registration warnings:
    ```typescript
    const NODE_TYPES: NodeTypes = {
      root: RootNode,
      branch: BranchNode,
      leaf: LeafNode,
    };

    const EDGE_TYPES: EdgeTypes = {
      organic: OrganicBranchEdge,
    };
    ```
  - Wraps workspace with `<ReactFlowProvider>`.
  - Passes `nodeTypes={NODE_TYPES}` and `edgeTypes={EDGE_TYPES}` references.
  - Mounts drawers, responsive floating toolbar, and keyboard event handlers.
- Create `src/app/map/[id]/page.tsx` as server component entry point passing document route params.

fix(mindmap): align plan with @xyflow/react, ssr-safe dexie, and mobile constraints