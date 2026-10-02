"use client";

import { useState } from "react";
import { TIERS, TIER_CUTOFFS } from "@/lib/score";

const rows = [
  { tier: TIERS.now, range: `${TIER_CUTOFFS.now}+` },
  { tier: TIERS.good, range: `${TIER_CUTOFFS.good}-${TIER_CUTOFFS.now - 1}` },
  { tier: TIERS.maybe, range: `${TIER_CUTOFFS.maybe}-${TIER_CUTOFFS.good - 1}` },
  { tier: TIERS.low, range: `under ${TIER_CUTOFFS.maybe}` },
];

/** Collapsible key for the rim colours, pinned to the bottom-left of the canvas. */
export function GradeLegend() {
  const [open, setOpen] = useState(true);
  return (
    <div className="absolute bottom-3 left-14 z-10 hidden sm:block">
      <div className={`${open ? "w-80" : "w-max"} rounded-md border border-line bg-surface/95 p-3`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium"
        >
          <span className="flex items-center gap-1">
            {!open && rows.map(({ tier }) => (
              <span key={tier.id} aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: tier.color }} />
            ))}
            <span className={open ? "" : "ml-1"}>Watch score key</span>
          </span>
          <span aria-hidden className="text-muted">{open ? "▾ Hide" : "▸ Show"}</span>
        </button>
        {open && (
          <>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {rows.map(({ tier, range }) => (
                <li key={tier.id} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: tier.color }} />
                  <span className="font-medium">{tier.label}</span>
                  <span className="text-muted">{range}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Rim = watch score out of 100, from rating, streaks, season, and your taste. Watched movies are scored too, for rewatching. ✓ watched, + planned.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
