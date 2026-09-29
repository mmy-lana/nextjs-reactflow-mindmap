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
