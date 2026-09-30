"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/parts/NodeShell";
import type { CanvasNode } from "@/types/mindmap";

/**
 * An intermediate node.
 *
 * Registered under the `branch` key, which `reindexNodeMetadata` assigns to
 * every non-root node that has at least one child. The shell shows a collapse
 * chevron whenever `data.childCount` is positive, and picks the side of the
 * handles from `data.direction`.
 */
function BranchNodeComponent(props: NodeProps<CanvasNode>): React.JSX.Element {
  return <NodeShell {...props} variant="branch" />;
}

export const BranchNode = memo(BranchNodeComponent);
