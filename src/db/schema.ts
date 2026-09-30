/**
 * IndexedDB schema for the offline-first mind mapping canvas.
 *
 * The database is a pure client concern: the Next.js server never touches it.
 * `getDB()` is therefore the single entry point and it fails loudly whenever it
 * is called during server-side rendering, which turns a class of hydration
 * bugs into an immediate, readable error.
 */

import Dexie, { type Table } from 'dexie';
import type { MindMapDocument, MindMapExportPayload } from '@/types/mindmap';

/** A stored document: metadata columns plus the full canvas payload. */
export interface LocalDocumentRecord extends MindMapDocument {
  /** Serialized `{ version, meta, nodes, edges }` snapshot. */
  data: MindMapExportPayload;
}

/** A stored user preference (minimap visibility, layout options, ...). */
export interface AppPreferencesRecord {
  key: string;
  /**
   * JSON encoded value. Everything is serialized as text so that reading a
   * preference back never has to guess whether a string is a JSON document.
   */
  value: string;
}

/** Physical database name. Versioned implicitly by the Dexie schema version. */
export const DATABASE_NAME = 'MindMapCanvasDB';

export class MindMapDatabase extends Dexie {
  documents!: Table<LocalDocumentRecord, string>;
  preferences!: Table<AppPreferencesRecord, string>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      documents: 'id, title, createdAt, updatedAt, *tags',
      preferences: 'key',
    });
  }
}

let databaseInstance: MindMapDatabase | null = null;

/**
 * Reports whether IndexedDB can be used in the current environment.
 * Private browsing modes and hardened browser settings can expose the API
 * while rejecting every operation, so callers should treat a `false` value
 * as "local persistence is unavailable" rather than as a fatal error.
 */
export function isIndexedDbAvailable(): boolean {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return false;
  }
  try {
    return typeof window.indexedDB?.open === 'function';
  } catch {
    return false;
  }
}

/**
 * Lazily creates and returns the database singleton.
 *
 * @throws {Error} when called outside of a browser environment.
 */
export function getDB(): MindMapDatabase {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB cannot be accessed during server-side execution.');
  }
  if (!databaseInstance) {
    databaseInstance = new MindMapDatabase();
  }
  return databaseInstance;
}

/**
 * Closes and forgets the singleton. Used when the editor unmounts for good and
 * by tests that need a pristine database.
 */
export async function closeDB(): Promise<void> {
  if (!databaseInstance) {
    return;
  }
  const instance = databaseInstance;
  databaseInstance = null;
  instance.close();
}
