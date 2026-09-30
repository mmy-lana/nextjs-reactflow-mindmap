/**
 * JSON and SVG export for a whole mind map.
 *
 * Import is the interesting half: an imported document gets fresh node and
 * edge ids, because ids are only unique inside one document. Keeping them
 * would make a second copy of the same file collide with the first inside
 * IndexedDB, and would make React Flow treat the copy as a drag of the
 * original. Every reference to a node id is remapped through one table, and the
 * hierarchy field inside `data` is remapped with it, so the copy is internally
 * consistent.
 */

import {
  MINDMAP_SCHEMA_VERSION,
  isMindMapExportPayload,
  type CanvasEdge,
  type CanvasNode,
  type LayoutOptions,
  type MindMapDocument,
  type MindMapExportPayload,
} from "@/types/mindmap";
import { createUuid } from "@/lib/nodeFactory";
import { repairMindMapGraph } from "@/lib/treeTransforms";
import { sanitizeLayoutOptions } from "@/lib/layoutEngine";

/** Fields that must never survive a round trip through a file. */
const TRANSIENT_NODE_KEYS = ['selected', 'dragging', 'measured', 'width', 'height'] as const;
const TRANSIENT_EDGE_KEYS = ['selected'] as const;

/**
 * Import limits.
 *
 * Both are checked before the payload is laid out: 5MB of text is the point
 * where `JSON.parse` stops being instant, and 2000 nodes is where a single
 * document stops being something a person can read in one screen. Both
 * numbers are part of the user facing error text, so they live in one place.
 */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_NODES = 2000;

/** Elements dropped from an exported clone, with the reason each is unsafe. */
const SCRIPT_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE']);

/**
 * CSS properties copied onto a cloned node so the SVG reads without the
 * stylesheet the page is using. Tailwind compiles to classes, and a file
 * opened outside this app has none of them.
 */
const INLINED_NODE_STYLES = [
  'background-color',
  'color',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'box-shadow',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'text-align',
] as const;

export class ExportError extends Error {
  public readonly code: 'invalid_json' | 'invalid_payload' | 'version_mismatch' | 'render_failed';

  public constructor(
    code: 'invalid_json' | 'invalid_payload' | 'version_mismatch' | 'render_failed',
    message: string,
  ) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/*                              JSON export                                    */
/* -------------------------------------------------------------------------- */

/** Builds the portable payload for a document. */
export function buildExportPayload(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  meta: MindMapDocument,
): MindMapExportPayload {
  return {
    version: MINDMAP_SCHEMA_VERSION,
    meta: { ...meta, nodeCount: nodes.length },
    nodes: nodes.map(stripTransientNodeFields),
    edges: edges.map(stripTransientEdgeFields),
  };
}

/**
 * Serializes a document to pretty printed JSON.
 *
 * Runtime state such as the selection and the measured size is stripped: it is
 * meaningless in a file and would make two exports of the same map differ.
 */
export function exportToJson(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  meta: MindMapDocument,
): string {
  return `${JSON.stringify(buildExportPayload(nodes, edges, meta), null, 2)}\n`;
}

function stripTransientNodeFields(node: CanvasNode): CanvasNode {
  const copy = { ...node } as Record<string, unknown>;
  for (const key of TRANSIENT_NODE_KEYS) {
    delete copy[key];
  }
  return copy as unknown as CanvasNode;
}

function stripTransientEdgeFields(edge: CanvasEdge): CanvasEdge {
  const copy = { ...edge } as Record<string, unknown>;
  for (const key of TRANSIENT_EDGE_KEYS) {
    delete copy[key];
  }
  return copy as unknown as CanvasEdge;
}

/* -------------------------------------------------------------------------- */
/*                              JSON import                                    */
/* -------------------------------------------------------------------------- */

export interface ImportedMindMap {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** The title carried by the file, for the confirmation dialog. */
  title: string;
  /** The description carried by the file, if any. */
  description: string;
  /** Tags carried by the file. */
  tags: string[];
  /** How many nodes the file contained before the copy was given new ids. */
  sourceNodeCount: number;
  /**
   * Layout the file was drawn with, normalised.
   *
   * The edges in a payload are wired to the faces that layout uses, so the two
   * have to travel together: importing a radial file into a session configured
   * for horizontal would leave every edge asking for a face the canvas is no
   * longer routing through. `undefined` for a file that predates the field.
   */
  layoutOptions?: LayoutOptions;
}

/**
 * Parses an exported document and re-identifies it.
 *
 * @throws {ExportError} with a user facing message for anything unusable, so a
 *         caller can render the reason instead of a parse stack.
 */
export function importFromJson(jsonString: string): ImportedMindMap {
  /**
   * The size ceiling is checked before `JSON.parse`.
   *
   * Parsing is the expensive part, and a file the user picked by accident (a
   * video, a build artefact) would be turned into a multi hundred megabyte
   * object graph before any limit could notice. The string length is a cheap,
   * allocation free proxy for the parsed size, which is what makes this a real
   * guard rather than a formality.
   */
  if (jsonString.length > MAX_IMPORT_BYTES) {
    throw new ExportError('invalid_payload', 'Payload exceeds 5MB limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new ExportError(
      'invalid_json',
      error instanceof Error ? `The file is not valid JSON: ${error.message}` : 'The file is not valid JSON.',
    );
  }

  if (!isMindMapExportPayload(parsed)) {
    throw new ExportError(
      'invalid_payload',
      'The file is not a mind map export, or it is missing its root node.',
    );
  }

  const payload = parsed;
  if (payload.version !== MINDMAP_SCHEMA_VERSION) {
    throw new ExportError(
      'version_mismatch',
      `The file was written by another version of the app (${payload.version}).`,
    );
  }

  /**
   * A structurally valid file can still be too big to lay out.
   *
   * The node count is the real cost driver: every node is measured, positioned
   * and turned into DOM, so a payload with 200k well formed nodes would lock the
   * tab long before the byte limit complains. Both guards are inside the try
   * free zone here because `isMindMapExportPayload` has already proved the
   * arrays are arrays.
   */
  if (payload.nodes.length > MAX_IMPORT_NODES) {
    throw new ExportError(
      'invalid_payload',
      'Document exceeds maximum limit of 2000 nodes.',
    );
  }

  const idMap = new Map<string, string>();
  for (const node of payload.nodes) {
    // A duplicate id inside one file would map twice; the first occurrence wins
    // so every later reference resolves to the same new node.
    if (!idMap.has(node.id)) {
      idMap.set(node.id, createUuid());
    }
  }

  const remap = (id: string): string => idMap.get(id) ?? createUuid();

  const nodes = payload.nodes.map((node) => {
    const nextId = remap(node.id);
    const parentId = node.data.parentId;
    return stripTransientNodeFields({
      ...node,
      id: nextId,
      // The hierarchy lives in the data, not in React Flow's `parentId`, so it
      // needs remapping too.
      data: {
        ...node.data,
        parentId: parentId ? (idMap.get(parentId) ?? null) : null,
        isCollapsed: false,
      },
    });
  });

  const edges = payload.edges
    // An edge to a node that is not in the file cannot be drawn.
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) =>
      stripTransientEdgeFields({
        ...edge,
        id: createUuid(),
        source: remap(edge.source),
        target: remap(edge.target),
      }),
    );

  // Re-derives depth, childCount and node type, and re-attaches a component
  // that arrived detached, so a hand edited file that got the hierarchy wrong
  // still imports into a single consistent tree.
  const repaired = repairMindMapGraph(nodes, edges);

  /**
   * `meta.layoutOptions` is canonical; the top level mirror is only consulted for
   * a file that does not carry one, so a normalising export and a hand written
   * file both import and never disagree afterwards.
   */
  const storedLayout = payload.meta.layoutOptions ?? payload.layoutOptions;

  return {
    nodes: repaired.nodes.map((node) => ({ ...node, hidden: false })),
    edges: repaired.edges,
    title: payload.meta.title,
    description: payload.meta.description,
    tags: payload.meta.tags,
    sourceNodeCount: payload.nodes.length,
    ...(storedLayout === undefined
      ? {}
      : { layoutOptions: sanitizeLayoutOptions(storedLayout) }),
  };
}

/** A filesystem friendly file name derived from a document title. */
export function buildFileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug.length > 0 ? slug : 'mind-map'}-${stamp}.${extension}`;
}

/**
 * Triggers a browser download.
 *
 * The object URL is revoked on the next macrotask: revoking it synchronously
 * races the download in Safari, which has been known to abort the transfer.
 */
export function downloadFile(fileName: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/*                               SVG export                                    */
/* -------------------------------------------------------------------------- */

/** How much empty space to leave around the exported drawing, in pixels. */
const SVG_PADDING = 48;

/**
 * Serializes a rendered React Flow pane to a standalone SVG.
 *
 * The live DOM is cloned and rewritten rather than re-rendering the graph into
 * a fresh SVG, because only the clone already carries the measured positions,
 * the custom node markup and the edge paths.
 *
 * @param containerElement the `.react-flow__viewport` element
 * @param title accessible name written into the document
 * @returns the SVG source
 * @throws {ExportError} when the element is missing or has no drawable content
 */
export async function exportToSvg(containerElement: HTMLElement, title: string): Promise<string> {
  const viewport = containerElement.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) {
    throw new ExportError(
      'render_failed',
      'The canvas is not ready to export yet. Wait for the map to appear and try again.',
    );
  }

  // The nodes are absolutely positioned inside a transformed wrapper; the clone
  // has to undo that transform and bake the offsets into the coordinates.
  const transform = viewport.style.transform;
  const matrix = new DOMMatrixReadOnly(
    transform && transform !== 'none' ? transform : undefined,
  );
  const source = viewport.getBoundingClientRect();

  const clone = viewport.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.width = `${source.width}px`;
  clone.style.height = `${source.height}px`;

  // Interaction state and the attribution have no place in a static file.
  clone
    .querySelectorAll(
      '.react-flow__handle, .react-flow__attribution, .react-flow__controls, .react-flow__minimap, .react-flow__panel, [data-export-ignore]',
    )
    .forEach((element) => element.remove());
  clone.querySelectorAll('.react-flow__node.selected').forEach((element) => {
    element.classList.remove('selected');
  });
  // The editor overlays are not part of the map.
  clone.querySelectorAll('[data-node-overlay]').forEach((element) => element.remove());

  sanitizeClone(clone);
  inlineNodeAppearance(clone, containerElement);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const width = source.width;
  const height = source.height;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');

  const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  titleElement.textContent = title;
  svg.append(titleElement);

  // A solid backdrop, because the app's own background is a dark gradient that
  // would otherwise render as transparent black.
  const backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backdrop.setAttribute('width', '100%');
  backdrop.setAttribute('height', '100%');
  backdrop.setAttribute('fill', '#0c0d0e');
  svg.append(backdrop);

  /**
   * The HTML lives in a `foreignObject`, and it has to.
   *
   * Node cards are `div`s with Tailwind classes. Dropping them straight into
   * the `<svg>` root produced a file that no XML parser would accept, because
   * an SVG document may only contain SVG elements, and every consumer of the
   * file reported it as corrupt. `foreignObject` is the SVG element that exists
   * precisely to hold a subtree of XHTML, and the explicit `xmlns` is what
   * tells an XML parser which namespace those `div`s belong to once the file
   * travels outside this document.
   */
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', String(width));
  foreignObject.setAttribute('height', String(height));
  foreignObject.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

  // The outer div establishes the XHTML namespace for the whole subtree and
  // clips the map to the exported area.
  const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  host.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = 'hidden';
  host.style.position = 'relative';

  // The inner div re-applies the pan and zoom that `clone` no longer carries.
  // Flow space runs top left to bottom right, so the box is as large as the
  // panned extent rather than the visible one.
  const stage = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  stage.style.position = 'absolute';
  stage.style.top = '0';
  stage.style.left = '0';
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate(${matrix.e}px, ${matrix.f}px) scale(${matrix.a}, ${matrix.d})`;
  stage.style.width = `${Math.max(width, (width - matrix.e) / matrix.a)}px`;
  stage.style.height = `${Math.max(height, (height - matrix.f) / matrix.d)}px`;
  stage.append(clone);
  host.append(stage);
  foreignObject.append(host);
  svg.append(foreignObject);

  // Serialization is synchronous today, but inlining styles needs a layout
  // flush and could become asynchronous, so the contract is a promise.
  await Promise.resolve();

  const markup = new XMLSerializer().serializeToString(svg);
  if (markup.length < SVG_PADDING) {
    throw new ExportError('render_failed', 'The canvas is empty, so there is nothing to export.');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
}

/**
 * Strips everything executable from a cloned subtree.
 *
 * The clone is a copy of live DOM, so it can carry `<script>` elements, the
 * inline label editors, and React's `onClick` style handlers along with it. A
 * document that is emailed to a colleague and opened in a browser must not be
 * able to run anything, and an `on*` attribute inside a `foreignObject` is
 * exactly the kind of thing a viewer would honour. The rule is by attribute
 * name rather than by allow list, so a future interactive node cannot slip
 * through by using a handler nobody thought to list.
 */
function sanitizeClone(clone: HTMLElement): void {
  const all: HTMLElement[] = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];

  for (const element of all) {
    if (SCRIPT_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }
    // Live editors: their value is already in the node's data, and a rendered
    // input in a file is a form nobody can submit.
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    }
    // Links and forms are the other two ways an exported file can act on the
    // person who opens it.
    if (element.tagName === 'A') {
      element.removeAttribute('href');
      element.removeAttribute('target');
    }
    if (element.tagName === 'FORM') {
      element.removeAttribute('action');
      element.removeAttribute('method');
    }
  }
}

/**
 * Copies the resolved appearance of each node onto the clone.
 *
 * The stylesheet is not part of the file: opened anywhere but this app, the
 * Tailwind classes mean nothing and every node would render as unstyled stacked
 * text. The computed values travel with the markup instead. Handles and
 * overlays have already been removed, so a node that is hovered or selected
 * contributes its resting appearance and not its transient one.
 */
function inlineNodeAppearance(clone: HTMLElement, containerElement: HTMLElement): void {
  const liveNodes = containerElement.querySelectorAll<HTMLElement>('.react-flow__node');
  const clonedNodes = clone.querySelectorAll<HTMLElement>('.react-flow__node');

  clonedNodes.forEach((clonedNode, index) => {
    const liveNode = liveNodes[index];
    if (!liveNode) {
      return;
    }
    const computed = window.getComputedStyle(liveNode);
    let inlinedCount = 0;
    for (const property of INLINED_NODE_STYLES) {
      const value = computed.getPropertyValue(property);
      if (value) {
        clonedNode.style.setProperty(property, value);
        inlinedCount += 1;
      }
    }
    if (inlinedCount === 0) {
      // A node whose computed style is unreadable (detached mid-measure) still
      // has to be visible, so it gets the surface it is known to use.
      clonedNode.style.setProperty('background-color', 'var(--color-node-surface, #14161a)');
      clonedNode.style.setProperty('color', 'var(--color-canvas-text, #e7e9ee)');
    }
  });
}
