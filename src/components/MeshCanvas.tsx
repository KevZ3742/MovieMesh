"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type ColorMode,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { findLinks, spotAside, spotNear } from "@/lib/links";
import { useBubblePhysics } from "@/lib/useBubblePhysics";
import type { ExpandResponse, MeshMovieData, MeshNodeData, TmdbStatus } from "@/lib/types";
import { MovieNode } from "./nodes";

type FlowNode = Node<MeshNodeData>;
const nodeTypes = { movie: MovieNode };

type Point = { x: number; y: number };

// React Flow wants to know light vs dark. The server can't know the visitor's setting, so it
// renders "light" and the client switches right after hydrating (reading it during render would
// make the server and client HTML differ, which is the hydration error).
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeColorMode(cb: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const clientColorMode = (): ColorMode => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
const serverColorMode = (): ColorMode => "light";

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

/** A point a little way from `a` toward `b`: where a new node starts before it springs out. */
const nudge = (a: Point, b: Point, t = 0.1): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Ask the mesh to reveal a movie: zoom to it if it's on the canvas, otherwise add it. */
export type Focus = { data: MeshMovieData; nonce: number };

type Props = {
  root: MeshMovieData;
  focus: Focus | null;
  onSelect: (data: MeshNodeData) => void;
  onTmdb: (status: TmdbStatus) => void;
  onError: (message: string) => void;
  /** False when the person switched TMDB off: skip posters. */
  useTmdb: boolean;
};

/** Mount with a `key` of the root movie (and the TMDB setting) so changing either starts a fresh mesh. */
export function MeshCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Mesh {...props} />
    </ReactFlowProvider>
  );
}

function Mesh({ root, focus, onSelect, onTmdb, onError, useTmdb }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([
    { id: `m:${root.movieId}`, type: "movie", position: { x: 0, y: 0 }, data: root },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const colorMode = useSyncExternalStore(subscribeColorMode, clientColorMode, serverColorMode);
  const { fitView, getNodes } = useReactFlow();
  const handledFocus = useRef(0);
  const expanded = useRef(new Set<string>());
  const parents = useRef(new Map<string, string>());

  const fit = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => void fitView({ padding: 0.25, maxZoom: 1, duration: reduce ? 0 : 450 }), 80);
  }, [fitView]);

  // What to do with the camera once new nodes have finished springing into place. Nodes are still
  // moving right after they're added, so framing them any earlier would aim at the wrong spots.
  const afterSettle = useRef<(() => void) | null>(null);
  const onSettle = useCallback(() => {
    const run = afterSettle.current;
    afterSettle.current = null;
    if (run) run();
    else fit();
  }, [fit]);
  const physics = useBubblePhysics<FlowNode>(setNodes, onSettle);

  const expand = useCallback(
    async (node: FlowNode) => {
      const id = node.id;
      if (expanded.current.has(id)) return;
      expanded.current.add(id);
      const setLoading = (loading: boolean) =>
        setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, loading } } : n)));
      setLoading(true);
      try {
        const res = await fetch(`/api/expand?id=${node.data.movieId}${useTmdb ? "" : "&tmdb=0"}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load connections.");
        const data = body as ExpandResponse;
        onTmdb(data.tmdb);

        const current = getNodes() as FlowNode[];
        const parent = current.find((n) => n.id === id);
        let launched = 0;
        if (parent) {
          const have = new Set(current.map((n) => n.id));
          const grand = current.find((n) => n.id === parents.current.get(id));
          const fresh = data.nodes.filter((n) => !have.has(n.id));
          const spots = place(parent.position, grand?.position ?? null, fresh.length);
          afterSettle.current = null; // the latest expansion decides how the camera frames things
          // New nodes start just off their parent and spring out to their spots.
          const added: FlowNode[] = fresh.map((n, i) => {
            parents.current.set(n.id, id);
            physics.launch(n.id, spots[i], id);
            return { id: n.id, type: "movie", position: nudge(parent.position, spots[i]), data: n };
          });
          launched = added.length;
          setNodes((ns) => {
            const ids = new Set(ns.map((n) => n.id));
            return [...ns, ...added.filter((n) => !ids.has(n.id))];
          });
        }
        setEdges((es) => {
          const have = new Set(es.map((e) => e.id));
          const add = data.edges
            .map((e) => ({ id: `${e.source}>${e.target}`, source: e.source, target: e.target }))
            .filter((e) => !have.has(e.id) && !have.has(`${e.target}>${e.source}`));
          return [...es, ...add];
        });
        // With new nodes the camera follows once they settle (see onSettle); otherwise frame now.
        if (data.nodes.length && !launched) fit();
      } catch (e) {
        expanded.current.delete(id);
        onError(e instanceof Error ? e.message : "Couldn't load connections.");
      } finally {
        setLoading(false);
      }
    },
    [fit, getNodes, onError, onTmdb, physics, setEdges, setNodes, useTmdb],
  );

  // Grow the first node once, as soon as the mesh appears.
  useEffect(() => {
    const t = setTimeout(() => void expand(nodes[0]), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal a movie picked from outside the canvas (e.g. My list).
  useEffect(() => {
    if (!focus || handledFocus.current === focus.nonce) return;
    const t = setTimeout(() => {
      handledFocus.current = focus.nonce;
      const id = `m:${focus.data.movieId}`;
      const current = getNodes() as FlowNode[];
      const existing = current.find((n) => n.id === id);
      let shown: MeshNodeData = existing ? existing.data : focus.data;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!existing) {
        const links = findLinks(focus.data, current);
        const anchor = links.length ? current.find((n) => n.id === links[0].nodeId) : undefined;
        const others = current.map((n) => n.position);
        const grand = anchor ? current.find((n) => n.id === parents.current.get(anchor.id)) : undefined;
        const position = anchor ? spotNear(anchor.position, grand?.position ?? null, others) : spotAside(others);
        shown = { ...focus.data, via: links.length ? `Similar: ${links[0].via}` : "From your list (not linked to anything here yet)" };
        if (anchor) parents.current.set(id, anchor.id);
        setNodes((ns) => [
          ...ns,
          { id, type: "movie", position: anchor ? nudge(anchor.position, position) : position, data: shown },
        ]);
        setEdges((es) => [
          ...es,
          ...links.map((l) => ({ id: `${l.nodeId}>${id}`, source: l.nodeId, target: id })),
        ]);
        // Zoom to it once it has finished springing into place (and nudged its neighbours aside).
        afterSettle.current = () =>
          void fitView({ nodes: [{ id }], padding: 1.2, maxZoom: 1, duration: reduce ? 0 : 500 });
        physics.launch(id, position, anchor?.id ?? null);
      }
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
      onSelect(shown);
      if (existing) {
        window.setTimeout(() => void fitView({ nodes: [{ id }], padding: 1.2, maxZoom: 1, duration: reduce ? 0 : 500 }), 120);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [focus, fitView, getNodes, onSelect, physics, setEdges, setNodes]);

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
      // Dragging a node pins it; everything it runs into gets pushed out of the way, live.
      onNodeDragStart={(_, node) => physics.pin(node.id)}
      onNodeDrag={() => physics.wake()}
      onNodeDragStop={(_, node) => physics.unpin(node.id)}
      nodesConnectable={false}
      defaultEdgeOptions={{ type: "straight", style: { strokeWidth: 1.5 } }}
      fitView
      fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.5}
      colorMode={colorMode}
    >
      <Background gap={28} size={1} color="var(--line)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
