"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { imageUrl } from "@/lib/images";
import { useLibrary } from "@/lib/library";
import { scoreMovie } from "@/lib/score";
import type { MeshMovieData } from "@/lib/types";

// Edges run centre to centre, so both handles sit invisibly in the middle of the node.
const anchor = { opacity: 0, pointerEvents: "none" as const, left: "50%", top: "50%" };
const Anchors = () => (
  <>
    <Handle type="target" position={Position.Top} style={anchor} />
    <Handle type="source" position={Position.Top} style={anchor} />
  </>
);

export function MovieNode({ data, selected }: NodeProps<Node<MeshMovieData, "movie">>) {
  const lib = useLibrary();
  const scored = useMemo(() => scoreMovie(data, lib, new Date()), [data, lib]);
  const { tier } = scored;
  const color = tier.color;
  const poster = imageUrl(data.posterPath, "w92");
  return (
    <div
      className="relative flex w-44 items-center gap-2.5 rounded-lg bg-surface p-2 text-left"
      style={{
        border: `3px ${tier.dashed ? "dashed" : "solid"} ${color}`,
        boxShadow: selected
          ? "0 0 0 3px var(--ink)"
          : tier.id === "now"
            ? `0 0 0 5px color-mix(in srgb, ${color} 30%, transparent)`
            : "0 1px 2px rgb(0 0 0 / 0.1)",
      }}
    >
      <Anchors />
      {scored.status && (
        <span
          aria-label={scored.status === "watched" ? "Watched" : "On your plan-to-watch list"}
          className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] leading-none text-surface"
        >
          {scored.status === "watched" ? "✓" : "+"}
        </span>
      )}
      {poster ? (
        <img src={poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div
          aria-hidden
          className="grid h-14 w-10 shrink-0 place-items-center rounded font-display text-base"
          style={{ background: `color-mix(in srgb, ${color} 25%, var(--surface))` }}
        >
          {data.title.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 text-[13px] font-medium leading-tight">{data.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {data.loading ? "Loading..." : (data.year ?? "")}
          {!data.loading && scored.status === "watched" && scored.rating !== null && (
            <span className="font-semibold text-ink"> · {"★".repeat(scored.rating)}</span>
          )}
          {!data.loading && scored.score !== null && (
            <span className="font-semibold" style={{ color }}>
              {" "}
              · {scored.score}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
