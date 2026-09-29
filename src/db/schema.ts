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
