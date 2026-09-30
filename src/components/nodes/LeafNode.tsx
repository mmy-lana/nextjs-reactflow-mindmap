"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/parts/NodeShell";
import type { CanvasNode } from "@/types/mindmap";

/**
 * A terminal node.
 *
 * Registered under the `leaf` key: a non-root node without children. There is
 * nothing to collapse, so the shell omits the chevron and the branch affordance.
 */
function LeafNodeComponent(props: NodeProps<CanvasNode>): React.JSX.Element {
  return <NodeShell {...props} variant="leaf" isCompact />
}

export const LeafNode = memo(LeafNodeComponent);
