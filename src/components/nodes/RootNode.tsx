"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/parts/NodeShell";
import type { CanvasNode } from "@/types/mindmap";

/**
 * The document's single concept.
 *
 * Registered under the `root` key, so React Flow only ever renders this for the
 * node at depth 0. It is visually promoted: a wider minimum, the status badge
 * underneath the title, and a source handle on both sides because the root has
 * no parent to receive an edge.
 */
function RootNodeComponent(props: NodeProps<CanvasNode>): React.JSX.Element {
  return <NodeShell {...props} variant="root" />;
}

export const RootNode = memo(RootNodeComponent);
