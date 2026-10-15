import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bug, Flag, KeyRound, Server, Waypoints, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { SimGraphNode } from '@psc/shared';
import { cn } from '@/lib/utils';

/** Kind is always shown as icon + label text, never color alone. */
export const KIND: Record<SimGraphNode['kind'], { icon: LucideIcon; label: string; className: string }> = {
  host: { icon: Server, label: 'Host', className: 'border-border-strong' },
  service: { icon: Waypoints, label: 'Service', className: 'border-border' },
  finding: { icon: Bug, label: 'Finding', className: 'border-warning/60 bg-warning-soft/40' },
  credential: { icon: KeyRound, label: 'Credential', className: 'border-danger/50 bg-danger-soft/40' },
  objective: { icon: Flag, label: 'Objective', className: 'border-accent bg-accent-soft/50' },
};

const COL = 230;
const ROW = 58;

type Data = { node: SimGraphNode; fresh: boolean };

function GraphNode({ data }: NodeProps<Node<Data>>) {
  const k = KIND[data.node.kind];
  const Icon = k.icon;
  return (
    <div
      className={cn('flex w-[200px] items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-xs shadow-card', k.className, data.fresh && 'ring-2 ring-[var(--ring)]')}
      title={`${k.label}: ${data.node.label}`}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-[var(--border-strong)]" />
      <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-faint">{k.label}</div>
        <div className="truncate font-medium text-text">{data.node.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-[var(--border-strong)]" />
    </div>
  );
}

const nodeTypes = { sim: GraphNode };

/** Tidy left-to-right tree: depth → column, leaf order → row, parents centered on their children. */
export function layout(graph: SimGraphNode[]): Map<string, { x: number; y: number }> {
  const ids = new Set(graph.map((n) => n.id));
  const children = new Map<string, SimGraphNode[]>();
  const roots: SimGraphNode[] = [];
  for (const n of graph) {
    if (n.parent && ids.has(n.parent) && n.parent !== n.id) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
    else roots.push(n);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let row = 0;
  const place = (n: SimGraphNode, depth: number, seen: Set<string>): number => {
    if (seen.has(n.id)) return pos.get(n.id)?.y ?? 0;
    seen.add(n.id);
    const kids = children.get(n.id) ?? [];
    let y: number;
    if (!kids.length) y = row++ * ROW;
    else {
      const ys = kids.map((k) => place(k, depth + 1, seen));
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    pos.set(n.id, { x: depth * COL, y });
    return y;
  };
  const seen = new Set<string>();
  for (const r of roots) place(r, 0, seen);
  for (const n of graph) if (!pos.has(n.id)) place(n, 0, seen); // cycles
  return pos;
}

export function AttackGraph({ graph, latestStep }: { graph: SimGraphNode[]; latestStep?: number }) {
  const { nodes, edges } = useMemo(() => {
    const pos = layout(graph);
    const nodes: Node<Data>[] = graph.map((n) => ({
      id: n.id,
      type: 'sim',
      position: pos.get(n.id)!,
      data: { node: n, fresh: latestStep != null && n.discoveredAt === latestStep },
      draggable: false,
      connectable: false,
    }));
    const ids = new Set(graph.map((n) => n.id));
    const edges: Edge[] = graph
      .filter((n) => n.parent && ids.has(n.parent))
      .map((n) => ({ id: `${n.parent}->${n.id}`, source: n.parent!, target: n.id, style: { stroke: 'var(--border-strong)', strokeWidth: 1.5 } }));
    return { nodes, edges };
  }, [graph, latestStep]);

  return (
    <div className="h-80 overflow-hidden rounded-lg border border-border bg-surface-2" aria-label={`Attack-path graph with ${graph.length} discovered items`} role="img">
      <ReactFlow
        key={graph.length}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        minZoom={0.3}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--chart-grid)" />
      </ReactFlow>
    </div>
  );
}
