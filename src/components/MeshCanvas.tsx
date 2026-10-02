"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ExpandResponse, MeshMovieData, MeshNodeData, TmdbStatus } from "@/lib/types";
import { MovieNode, PersonNode } from "./nodes";

type FlowNode = Node<MeshNodeData>;
const nodeTypes = { movie: MovieNode, person: PersonNode };

type Point = { x: number; y: number };

/** Fan new nodes out around `center`, away from the node it was reached from. */
function place(center: Point, from: Point | null, count: number): Point[] {
  if (!count) return [];
  const radius = 280 + count * 14;
  const full = !from;
  const base = from ? Math.atan2(center.y - from.y, center.x - from.x) : -Math.PI / 2;
  const arc = full ? Math.PI * 2 : Math.min(Math.PI * 1.2, 0.55 * count + 0.4);
  return Array.from({ length: count }, (_, i) => {
    const a = full ? base + (arc * i) / count : base - arc / 2 + (arc * (i + 0.5)) / count;
    return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
  });
}

type Props = {
  root: MeshMovieData;
  onSelect: (data: MeshNodeData) => void;
  onTmdb: (status: TmdbStatus) => void;
  onError: (message: string) => void;
};

/** Mount with `key={root.movieId}` so choosing a new movie starts a fresh mesh. */
export function MeshCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Mesh {...props} />
    </ReactFlowProvider>
  );
}

function Mesh({ root, onSelect, onTmdb, onError }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([
    { id: `m:${root.movieId}`, type: "movie", position: { x: 0, y: 0 }, data: root },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();
  const expanded = useRef(new Set<string>());
  const parents = useRef(new Map<string, string>());

  const fit = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => void fitView({ padding: 0.25, maxZoom: 1, duration: reduce ? 0 : 450 }), 80);
  }, [fitView]);

  const expand = useCallback(
    async (node: FlowNode) => {
      const id = node.id;
      if (expanded.current.has(id)) return;
      expanded.current.add(id);
      const setLoading = (loading: boolean) =>
        setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, loading } } : n)));
      setLoading(true);
      try {
        const d = node.data;
        const url =
          d.kind === "movie"
            ? `/api/expand?type=movie&id=${d.movieId}`
            : `/api/expand?type=person&id=${d.personId}&name=${encodeURIComponent(d.name)}`;
        const res = await fetch(url);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load connections.");
        const data = body as ExpandResponse;
        onTmdb(data.tmdb);

        setNodes((ns) => {
          const have = new Set(ns.map((n) => n.id));
          const parent = ns.find((n) => n.id === id);
          if (!parent) return ns;
          const grand = ns.find((n) => n.id === parents.current.get(id));
          const fresh = data.nodes.filter((n) => !have.has(n.id));
          const spots = place(parent.position, grand?.position ?? null, fresh.length);
          fresh.forEach((n) => parents.current.set(n.id, id));
          return [...ns, ...fresh.map((n, i) => ({ id: n.id, type: n.kind, position: spots[i], data: n }))];
        });
        setEdges((es) => {
          const have = new Set(es.map((e) => e.id));
          const add = data.edges
            .map((e) => ({ id: `${e.source}>${e.target}`, source: e.source, target: e.target }))
            .filter((e) => !have.has(e.id) && !have.has(`${e.target}>${e.source}`));
          return [...es, ...add];
        });
        if (data.nodes.length) fit();
      } catch (e) {
        expanded.current.delete(id);
        onError(e instanceof Error ? e.message : "Couldn't load connections.");
      } finally {
        setLoading(false);
      }
    },
    [fit, onError, onTmdb, setEdges, setNodes],
  );

  // Grow the first node once, as soon as the mesh appears.
  useEffect(() => {
    const t = setTimeout(() => void expand(nodes[0]), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback(
    (_, node) => {
      onSelect(node.data);
      void expand(node);
    },
    [expand, onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      nodesConnectable={false}
      defaultEdgeOptions={{ type: "straight", style: { strokeWidth: 1.5 } }}
      fitView
      fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.5}
      colorMode="system"
    >
      <Background gap={28} size={1} color="var(--line)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
