"use client";

import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useReactFlow, type Node } from "@xyflow/react";

/*
 * Bubbly node physics.
 *
 *  - Nodes are soft rectangles. When two overlap they shove each other apart along the line between
 *    their centres. The shove is part instant correction, part velocity, so they slightly overshoot
 *    and wobble back (that's the "bubbly" part).
 *  - A node can be "launched": it springs from where it is to a target spot, so new nodes pop out of
 *    the node you clicked instead of appearing in place.
 *  - A node being dragged is pinned: it ignores physics and everything else gets out of its way, live.
 *  - The loop runs only while something is moving, then goes to sleep.
 */

type Point = { x: number; y: number };

type Body = {
  vx: number;
  vy: number;
  /** Where a launched node is heading (top-left, like node.position). */
  target: Point | null;
  /** Until this time a freshly launched node doesn't collide with its parent or its siblings. */
  graceUntil: number;
  ignoreId: string | null;
};

type Item = {
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  w: number;
  h: number;
  body: Body;
  fixed: boolean;
};

// Used until React Flow has measured a node (matches w-44 and the usual card height).
const FALLBACK_W = 176;
const FALLBACK_H = 80;

// Tuning. Change these to taste:
const GAP = 18; // breathing room kept between nodes (px)
const SPRING = 0.05; // pull of a launched node toward its target; lower = lazier
const PUSH = 0.06; // velocity added per px of overlap; higher = more bounce
const FIX = 0.2; // share of an overlap corrected instantly each frame; higher = stiffer
const DAMP = 0.85; // velocity kept per frame (at 60fps); closer to 1 = wobblier
const MAX_SPEED = 60; // px per frame cap
const REST_SPEED = 0.05; // below this a node counts as still
const GRACE_MS = 450;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function angleFor(a: string, b: string) {
  let h = 0;
  for (const ch of a + b) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 360) * (Math.PI / 180);
}

export function useBubblePhysics<N extends Node>(setNodes: Dispatch<SetStateAction<N[]>>, onSettle: () => void) {
  const { getNodes } = useReactFlow();
  const onSettleRef = useRef(onSettle);
  useEffect(() => {
    onSettleRef.current = onSettle;
  });

  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return useMemo(() => {
    const bodies = new Map<string, Body>();
    const pinned = new Set<string>();
    let last = 0;
    let notify = false;

    const bodyOf = (id: string): Body => {
      let b = bodies.get(id);
      if (!b) {
        b = { vx: 0, vy: 0, target: null, graceUntil: 0, ignoreId: null };
        bodies.set(id, b);
      }
      return b;
    };

    const build = (): Item[] =>
      getNodes().map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        startX: n.position.x,
        startY: n.position.y,
        w: n.measured?.width ?? FALLBACK_W,
        h: n.measured?.height ?? FALLBACK_H,
        body: bodyOf(n.id),
        fixed: pinned.has(n.id),
      }));

    const skipPair = (a: Item, c: Item, now: number) => {
      const ga = now < a.body.graceUntil;
      const gc = now < c.body.graceUntil;
      if (ga && gc) return true; // siblings fly out together without bumping
      if (ga && a.body.ignoreId === c.id) return true; // and don't fight the node they came from
      if (gc && c.body.ignoreId === a.id) return true;
      return false;
    };

    /** One physics step. Returns true while anything still needs to move. */
    const step = (items: Item[], dt: number, now: number): boolean => {
      let active = false;
      const damp = Math.pow(DAMP, dt);

      // 1. launched nodes spring toward their targets
      for (const it of items) {
        const b = it.body;
        if (it.fixed) {
          b.vx = 0;
          b.vy = 0;
          b.target = null;
          continue;
        }
        if (!b.target) continue;
        const ex = b.target.x - it.x;
        const ey = b.target.y - it.y;
        b.vx += ex * SPRING * dt;
        b.vy += ey * SPRING * dt;
        active = true;
        if (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5 && Math.hypot(b.vx, b.vy) < 0.15) b.target = null;
      }

      // 2. overlapping nodes push each other apart
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const c = items[j];
          if (a.fixed && c.fixed) continue;
          if (skipPair(a, c, now)) continue;

          const dx = c.x + c.w / 2 - (a.x + a.w / 2);
          const dy = c.y + c.h / 2 - (a.y + a.h / 2);
          const ox = (a.w + c.w) / 2 + GAP - Math.abs(dx);
          const oy = (a.h + c.h) / 2 + GAP - Math.abs(dy);
          if (ox <= 0 || oy <= 0 || Math.min(ox, oy) < 0.5) continue;

          let ux = dx;
          let uy = dy;
          let len = Math.hypot(ux, uy);
          if (len < 0.001) {
            const ang = angleFor(a.id, c.id); // stacked exactly: pick a stable random direction
            ux = Math.cos(ang);
            uy = Math.sin(ang);
            len = 1;
          }
          ux /= len;
          uy /= len;
          // distance to travel along the centre line to clear the overlap on either axis
          const reach = Math.min(ox / Math.max(Math.abs(ux), 0.001), oy / Math.max(Math.abs(uy), 0.001), ox + oy);

          const wa = a.fixed ? 0 : 1;
          const wc = c.fixed ? 0 : 1;
          const total = wa + wc;
          const sa = wa / total;
          const sc = wc / total;
          a.x -= ux * reach * FIX * sa;
          a.y -= uy * reach * FIX * sa;
          c.x += ux * reach * FIX * sc;
          c.y += uy * reach * FIX * sc;
          a.body.vx -= ux * reach * PUSH * sa * dt;
          a.body.vy -= uy * reach * PUSH * sa * dt;
          c.body.vx += ux * reach * PUSH * sc * dt;
          c.body.vy += uy * reach * PUSH * sc * dt;
          active = true;
        }
      }

      // 3. move
      for (const it of items) {
        if (it.fixed) continue;
        const b = it.body;
        b.vx *= damp;
        b.vy *= damp;
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > MAX_SPEED) {
          b.vx = (b.vx / speed) * MAX_SPEED;
          b.vy = (b.vy / speed) * MAX_SPEED;
        }
        it.x += b.vx * dt;
        it.y += b.vy * dt;
        if (speed > REST_SPEED) active = true;
      }

      // a launched node that isn't on the canvas yet still needs us to keep going
      const seen = new Set(items.map((it) => it.id));
      for (const [id, b] of bodies) if (b.target && !seen.has(id)) active = true;

      return active;
    };

    const commit = (items: Item[]) => {
      const next = new Map<string, Point>();
      for (const it of items) {
        if (it.fixed) continue;
        if (Math.abs(it.x - it.startX) > 0.01 || Math.abs(it.y - it.startY) > 0.01) next.set(it.id, { x: it.x, y: it.y });
      }
      if (!next.size) return;
      setNodes((ns) =>
        ns.map((n) => {
          const p = next.get(n.id);
          return p && !pinned.has(n.id) ? { ...n, position: p } : n;
        }),
      );
    };

    const finish = () => {
      if (!notify) return;
      notify = false;
      onSettleRef.current();
    };

    const tick = (t: number) => {
      const dt = Math.min(Math.max((t - last) / 16.667, 0.25), 2);
      last = t;
      const items = build();
      const active = step(items, dt, t);
      commit(items);
      if (active) {
        raf.current = requestAnimationFrame(tick);
      } else {
        raf.current = 0;
        finish();
      }
    };

    const wake = () => {
      if (raf.current) return;
      if (reducedMotion()) {
        // No animation: work out the final layout in one go.
        raf.current = requestAnimationFrame(() => {
          const items = build();
          const later = performance.now() + 1e6; // grace periods are over
          for (let i = 0; i < 600 && step(items, 1, later); i++);
          commit(items);
          raf.current = 0;
          finish();
        });
        return;
      }
      last = performance.now();
      raf.current = requestAnimationFrame(tick);
    };

    return {
      /** Spring a node (already added to the canvas) toward `target`, ignoring the node it came from at first. */
      launch(id: string, target: Point, fromId: string | null) {
        const b = bodyOf(id);
        b.vx = 0;
        b.vy = 0;
        b.target = target;
        b.graceUntil = performance.now() + GRACE_MS;
        b.ignoreId = fromId;
        notify = true;
        wake();
      },
      /** Hold a node still (while it's being dragged) so it shoves others without being shoved. */
      pin(id: string) {
        pinned.add(id);
        wake();
      },
      unpin(id: string) {
        pinned.delete(id);
        wake();
      },
      /** Something changed (a node moved or was added): resolve any overlaps. */
      wake,
    };
  }, [getNodes, setNodes]);
}
