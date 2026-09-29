"use client";

import React, { useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
} from "@xyflow/react";
import type { CanvasNode, CanvasEdge } from "@/types/mindmap";

const NODE_TYPES: NodeTypes = {};
const EDGE_TYPES: EdgeTypes = {};

const INITIAL_NODES: CanvasNode[] = [
  {
    id: "root-1",
    type: "root",
    position: { x: 0, y: 0 },
    data: {
      label: "Central Concept",
      depth: 0,
      direction: "CENTER",
      order: 0,
      childCount: 0,
      tags: [],
      style: {
        backgroundColor: "#15171a",
        borderColor: "#6366f1",
        borderWidth: 2,
        textColor: "#f3f4f6",
        fontSize: 16,
        fontWeight: "bold",
        shape: "rounded",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  },
];

const INITIAL_EDGES: CanvasEdge[] = [];

interface MindMapEditorProps {
  documentId: string;
}

export default function MindMapEditor({ documentId }: MindMapEditorProps) {
  const [nodes, , onNodesChange] = useNodesState<CanvasNode>(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(INITIAL_EDGES);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds) as CanvasEdge[]),
    [setEdges]
  );

  return (
    <div className="w-screen h-screen bg-[#0c0d0e] relative">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          colorMode="dark"
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color="rgba(255, 255, 255, 0.08)"
          />
          <Controls className="bg-[#15171a] border border-[#282c34] rounded-lg text-white" />
          <MiniMap
            className="bg-[#15171a] border border-[#282c34] rounded-lg"
            nodeColor="#6366f1"
            maskColor="rgba(12, 13, 14, 0.7)"
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
