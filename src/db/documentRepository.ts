/**
 * Repository layer on top of Dexie.
 *
 * Every function in this module:
 * - refuses to run during server-side rendering (the underlying `getDB()`
 *   throws in that case and the error is re-thrown as a typed repository
 *   error),
 * - validates its input and the record it reads back, so a corrupted entry can
 *   never reach the store,
 * - converts low level IndexedDB failures into a {@link DocumentRepositoryError}
 *   carrying a stable `code` the UI can branch on.
 *
 * Callers never touch Dexie directly; this keeps the persistence contract
 * swappable and makes error states explicit.
 */

import {
  MINDMAP_SCHEMA_VERSION,
  UNNAMED_DOCUMENT_TITLE,
  containsSingleRootNode,
  isCanvasEdge,
  isCanvasNode,
  isDocumentMeta,
  isMindMapExportPayload,
  type CanvasEdge,
  type CanvasNode,
  type MindMapDocument,
  type MindMapExportPayload,
  type ViewportState,
} from '@/types/mindmap';
import { createRootNode, createUuid } from '@/lib/nodeFactory';
import { getDB, type AppPreferencesRecord, type LocalDocumentRecord } from './schema';

/** Stable error codes surfaced to the UI. */
export type DocumentRepositoryErrorCode =
  | 'unavailable'
  | 'not_found'
  | 'invalid_input'
  | 'corrupt_record'
  | 'write_failed'
  | 'unknown';

/** Error thrown by every repository accessor. */
export class DocumentRepositoryError extends Error {
  readonly code: DocumentRepositoryErrorCode;
  readonly cause?: unknown;

  constructor(code: DocumentRepositoryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DocumentRepositoryError';
    this.code = code;
    this.cause = cause;
  }
}

/** Values that can be persisted as a user preference. */
export type PreferenceValue = string | number | boolean | null | PreferenceValue[] | { [key: string]: PreferenceValue };

/** Preference keys owned by the application. */
export const PREFERENCE_KEYS = {
  minimapOpen: 'canvas.minimapOpen',
  layoutOptions: 'canvas.layoutOptions',
  lastDocumentId: 'canvas.lastDocumentId',
} as const;

const MAX_TITLE_LENGTH = 120;

/** Collapses whitespace and caps the length of a user supplied title. */
export function normalizeDocumentTitle(title: string): string {
  const collapsed = title.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) {
    return UNNAMED_DOCUMENT_TITLE;
  }
  return collapsed.length > MAX_TITLE_LENGTH
    ? `${collapsed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

/** Wraps an unknown rejection into a typed repository error. */
function toRepositoryError(error: unknown, fallbackCode: DocumentRepositoryErrorCode): DocumentRepositoryError {
  if (error instanceof DocumentRepositoryError) {
    return error;
  }
  if (error instanceof Error && error.message.includes('server-side execution')) {
    return new DocumentRepositoryError(
      'unavailable',
      'Local storage is only available in the browser.',
      error,
    );
  }
  if (isStorageFailure(error)) {
    return new DocumentRepositoryError(
      'unavailable',
      'Local storage could not be opened. Private browsing or a blocked database can cause this.',
      error,
    );
  }
  return new DocumentRepositoryError(fallbackCode, 'The local database rejected the operation.', error);
}

function isStorageFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'InvalidStateError' ||
    error.name === 'UnknownError' ||
    error.name === 'SecurityError' ||
    error.message.includes('IndexedDB')
  );
}

function defaultViewport(): ViewportState {
  return { x: 0, y: 0, zoom: 1 };
}

function assertNonEmptyId(id: string, parameterName: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new DocumentRepositoryError('invalid_input', `"${parameterName}" must be a non-empty string.`);
  }
}

export interface CreateDocumentOptions {
  /**
   * Forces the identifier of both the document and its root node.
   *
   * The editor is reached through `/map/[id]`, so a route parameter that has no
   * stored record yet must become the new document id. Omitting the option
   * generates a fresh id instead.
   */
  id?: string;
  description?: string;
  tags?: readonly string[];
}

/**
 * Creates a document seeded with its root concept and returns its id.
 *
 * @param title Requested title; blank or over-long input is normalized.
 * @param options Optional id and metadata overrides.
 * @throws {DocumentRepositoryError} `invalid_input` for a non-string title or
 *         a blank id, `write_failed` when IndexedDB refuses the write.
 */
export async function createDocument(
  title: string,
  options: CreateDocumentOptions = {},
): Promise<string> {
  if (typeof title !== 'string') {
    throw new DocumentRepositoryError('invalid_input', 'A document title must be a string.');
  }
  if (options.id !== undefined) {
    assertNonEmptyId(options.id, 'id');
  }

  const now = Date.now();
  const id = options.id ?? createUuid();
  // The root node shares the document id, which makes "is this the root?"
  // answerable without a second lookup.
  const rootNode = createRootNode({ id, createdAt: now, updatedAt: now });
  const resolvedTitle = normalizeDocumentTitle(title);

  const meta: MindMapDocument = {
    id,
    title: resolvedTitle,
    description: options.description ?? '',
    createdAt: now,
    updatedAt: now,
    nodeCount: 1,
    viewport: defaultViewport(),
    tags: [...(options.tags ?? [])],
  };

  const record: LocalDocumentRecord = {
    ...meta,
    data: {
      version: MINDMAP_SCHEMA_VERSION,
      meta,
      nodes: [rootNode],
      edges: [],
    },
  };

  try {
    await getDB().documents.put(record);
    return id;
  } catch (error) {
    throw toRepositoryError(error, 'write_failed');
  }
}

/**
 * Reads a document with its full canvas payload.
 *
 * @returns The record, or `undefined` when the document does not exist.
 * @throws {DocumentRepositoryError} `corrupt_record` when the stored payload no
 *         longer matches the current schema.
 */
export async function getDocument(id: string): Promise<LocalDocumentRecord | undefined> {
  assertNonEmptyId(id, 'id');

  let record: LocalDocumentRecord | undefined;
  try {
    record = await getDB().documents.get(id);
  } catch (error) {
    throw toRepositoryError(error, 'unknown');
  }

  if (!record) {
    return undefined;
  }

  if (!isLocalDocumentRecord(record)) {
    throw new DocumentRepositoryError(
      'corrupt_record',
      `The stored document "${id}" does not match the expected schema.`,
    );
  }

  return record;
}

/**
 * Writes a canvas payload, refreshing the derived metadata columns.
 *
 * @param id Identifier of the document to overwrite.
 * @param payload Snapshot produced by the store.
 * @throws {DocumentRepositoryError} `invalid_input` for a mismatched payload,
 *         `write_failed` when IndexedDB refuses the write.
 */
export async function saveDocumentSerialized(
  id: string,
  payload: MindMapExportPayload,
): Promise<void> {
  assertNonEmptyId(id, 'id');

  if (!isMindMapExportPayload(payload)) {
    throw new DocumentRepositoryError(
      'invalid_input',
      'The payload does not match the mind map export schema.',
    );
  }

  if (payload.meta.id !== id) {
    throw new DocumentRepositoryError(
      'invalid_input',
      `The payload belongs to document "${payload.meta.id}" but was saved as "${id}".`,
    );
  }

  const now = Date.now();
  const normalized: MindMapExportPayload = {
    ...payload,
    meta: {
      ...payload.meta,
      updatedAt: now,
      nodeCount: payload.nodes.length,
    },
  };

  const record: LocalDocumentRecord = {
    ...normalized.meta,
    data: normalized,
  };

  try {
    await getDB().documents.put(record);
  } catch (error) {
    throw toRepositoryError(error, 'write_failed');
  }
}

/**
 * Deletes a document and its payload.
 *
 * @throws {DocumentRepositoryError} `not_found` when the document is already
 *         gone, so the UI can report an accurate result.
 */
export async function deleteDocument(id: string): Promise<void> {
  assertNonEmptyId(id, 'id');

  try {
    const db = getDB();
    const existing = await db.documents.get(id);
    if (!existing) {
      throw new DocumentRepositoryError('not_found', `No document with id "${id}" is stored.`);
    }
    await db.documents.delete(id);
  } catch (error) {
    throw toRepositoryError(error, 'write_failed');
  }
}

/**
 * Lists every document, most recently updated first.
 *
 * The returned records only carry metadata: the canvas payload is stripped so
 * the dashboard never downloads node data it does not display.
 */
export async function listDocuments(): Promise<MindMapDocument[]> {
  try {
    const records = await getDB().documents.orderBy('updatedAt').reverse().toArray();
    return records
      .filter((record): record is LocalDocumentRecord => isDocumentMeta(record))
      .map((record) => toDocumentMeta(record));
  } catch (error) {
    throw toRepositoryError(error, 'unknown');
  }
}

/** Reads a single preference.
 *
 * @returns The decoded value, or `null` when the key was never written.
 */
export async function getPreference<T extends PreferenceValue = PreferenceValue>(key: string): Promise<T | null> {
  assertNonEmptyId(key, 'key');

  try {
    const record = await getDB().preferences.get(key);
    if (!record) {
      return null;
    }
    return JSON.parse(record.value) as T;
  } catch (error) {
    throw toRepositoryError(error, 'unknown');
  }
}

/** Writes a preference. Values are stored as JSON text to keep reads lossless. */
export async function setPreference(key: string, value: PreferenceValue): Promise<void> {
  assertNonEmptyId(key, 'key');

  const record: AppPreferencesRecord = { key, value: JSON.stringify(value) };
  try {
    await getDB().preferences.put(record);
  } catch (error) {
    throw toRepositoryError(error, 'write_failed');
  }
}

/** Removes a preference. Deleting a missing key is a no-op. */
export async function deletePreference(key: string): Promise<void> {
  assertNonEmptyId(key, 'key');

  try {
    await getDB().preferences.delete(key);
  } catch (error) {
    throw toRepositoryError(error, 'write_failed');
  }
}

/* -------------------------------------------------------------------------- */
/*                              Internal helpers                              */
/* -------------------------------------------------------------------------- */

/** Strips the canvas payload, keeping the indexed metadata columns. */
function toDocumentMeta(record: LocalDocumentRecord): MindMapDocument {
  let title = record.title;
  if (title.trim() === UNNAMED_DOCUMENT_TITLE && Array.isArray(record.data?.nodes)) {
    const root = record.data.nodes.find(
      (node) => node.type === 'root' || (node.data && node.data.depth === 0),
    );
    const rootLabel = root?.data?.label?.trim();
    if (rootLabel && rootLabel !== 'Central Concept' && rootLabel !== 'New Idea') {
      title = rootLabel;
    }
  }

  return {
    id: record.id,
    title,
    description: record.description,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nodeCount: record.nodeCount,
    viewport: record.viewport,
    tags: [...record.tags],
    layoutOptions: record.data?.meta?.layoutOptions ?? record.layoutOptions,
  };
}

/** Full structural validation of a stored record, payload included. */
function isLocalDocumentRecord(record: unknown): record is LocalDocumentRecord {
  if (typeof record !== 'object' || record === null) {
    return false;
  }

  const candidate = record as Partial<LocalDocumentRecord>;
  // Read the payload before the metadata guard narrows `candidate`.
  const data = candidate.data;
  if (!isDocumentMeta(candidate) || typeof data !== 'object' || data === null) {
    return false;
  }

  const payload = data as Partial<MindMapExportPayload>;
  return (
    typeof payload.version === 'string' &&
    isDocumentMeta(payload.meta) &&
    Array.isArray(payload.nodes) &&
    payload.nodes.every((node) => isCanvasNode(node as CanvasNode)) &&
    containsSingleRootNode(payload.nodes) &&
    Array.isArray(payload.edges) &&
    payload.edges.every((edge) => isCanvasEdge(edge as CanvasEdge))
  );
}
