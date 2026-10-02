"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { imageUrl } from "@/lib/images";
import { monthColor, monthsUntil } from "@/lib/seasons";
import type { MeshMovieData, MeshPersonData } from "@/lib/types";

// Edges run centre to centre, so both handles sit invisibly in the middle of the node.
const anchor = { opacity: 0, pointerEvents: "none" as const, left: "50%", top: "50%" };
const Anchors = () => (
  <>
    <Handle type="target" position={Position.Top} style={anchor} />
    <Handle type="source" position={Position.Top} style={anchor} />
  </>
);

export function MovieNode({ data, selected }: NodeProps<Node<MeshMovieData, "movie">>) {
  const color = monthColor(data.peakMonth);
  const inSeason = !data.weak && data.peakMonth !== null && monthsUntil(data.peakMonth) === 0;
  const poster = imageUrl(data.posterPath, "w92");
  return (
    <div
      className="flex w-44 items-center gap-2.5 rounded-lg bg-surface p-2 text-left"
      style={{
        border: `3px ${data.weak ? "dashed" : "solid"} ${color}`,
        boxShadow: selected
          ? "0 0 0 3px var(--ink)"
          : inSeason
            ? `0 0 0 5px color-mix(in srgb, ${color} 30%, transparent)`
            : "0 1px 2px rgb(0 0 0 / 0.1)",
      }}
    >
      <Anchors />
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
        <p className="mt-0.5 text-xs text-muted">{data.loading ? "Loading..." : (data.year ?? "")}</p>
      </div>
    </div>
  );
}

export function PersonNode({ data, selected }: NodeProps<Node<MeshPersonData, "person">>) {
  const photo = imageUrl(data.profilePath, "w92");
  return (
    <div
      className="flex w-40 items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-3"
      style={{
        border: "2px solid var(--line-strong)",
        boxShadow: selected ? "0 0 0 3px var(--ink)" : "0 1px 2px rgb(0 0 0 / 0.1)",
      }}
    >
      <Anchors />
      {photo ? (
        <img src={photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ground text-sm">
          {data.name.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0">
        <p className="line-clamp-1 text-xs font-medium">{data.name}</p>
        <p className="text-[11px] text-muted">{data.loading ? "Loading..." : "Actor"}</p>
      </div>
    </div>
  );
}
