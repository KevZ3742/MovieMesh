"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SettingsStatus } from "@/app/api/settings/route";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Whether TMDB is currently in use (has a key AND the switch is on). */
  tmdbOn: boolean;
  /** Whether the switch is turned on, regardless of whether a key exists. */
  tmdbPref: boolean;
  onTogglePref: (on: boolean) => void;
  /** Called after a key is saved or removed, with whether a usable key now exists. */
  onKeyChanged: (available: boolean) => void;
};

const field = "w-full rounded-lg border border-line bg-ground px-3 py-2 text-sm placeholder:text-muted";
const btn = "rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line";

export function SettingsDialog({ open, onClose, tmdbOn, tmdbPref, onTogglePref, onKeyChanged }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const keyId = useId();
  const helpId = useId();

  // Native <dialog> gives us focus trapping and Esc-to-close for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Ask the server what it's using each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: SettingsStatus) => live && setStatus(s))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [open]);

  const available = status?.available ?? false;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save the key.");
      setStatus(body as SettingsStatus);
      setKey("");
      setMsg({ ok: true, text: "Key works and is saved. Your mesh was restarted so posters show up." });
      onKeyChanged(true);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save the key." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", { method: "DELETE" });
      const body = (await res.json()) as SettingsStatus;
      setStatus(body);
      setMsg({ ok: true, text: body.available ? "Saved key removed. Using the key from .env.local." : "Saved key removed." });
      onKeyChanged(body.available);
    } catch {
      setMsg({ ok: false, text: "Couldn't remove the key." });
    } finally {
      setBusy(false);
    }
  }

  const sourceLine = !status
    ? "Checking..."
    : status.source === "user"
      ? `Using the key you saved here (ends in ${status.hint}).`
      : status.source === "env"
        ? "Using the key from your .env.local file."
        : "No key yet, so posters, summaries and cast are off.";

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${keyId}-title`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${keyId}-title`} className="font-display text-2xl font-semibold">
            Settings
          </h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="-mr-2 -mt-1 rounded-full px-2.5 py-1 text-xl leading-none text-muted hover:text-ink">
            ×
          </button>
        </div>

        <section aria-labelledby={`${keyId}-tmdb`} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id={`${keyId}-tmdb`} className="font-display text-base font-semibold">
                Use TMDB
              </h3>
              <p className="mt-0.5 text-sm text-muted">Posters, plot summaries, and cast lists. Switching restarts the mesh.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tmdbOn}
              aria-labelledby={`${keyId}-tmdb`}
              disabled={!available}
              onClick={() => onTogglePref(!tmdbPref)}
              className="mt-1 shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden className={`relative block h-6 w-11 rounded-full transition-colors ${tmdbOn ? "bg-[#2FA66A]" : "bg-line-strong"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${tmdbOn ? "left-[1.375rem]" : "left-0.5"}`} />
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line bg-ground/50 p-4">
            <label htmlFor={keyId} className="text-sm font-medium">
              Your TMDB API key
            </label>
            <p id={helpId} className="text-sm text-muted" aria-live="polite">
              {sourceLine}
            </p>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={helpId}
              placeholder="Paste a v3 API key or a v4 read access token"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && key.trim() && !busy && void save()}
              className={field}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void save()} disabled={busy || !key.trim()} className={`${btn} border-ink bg-ink text-surface hover:border-ink`}>
                {busy ? "Checking..." : "Save key"}
              </button>
              {status?.source === "user" && (
                <button type="button" onClick={() => void remove()} disabled={busy} className={btn}>
                  Remove saved key
                </button>
              )}
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="ml-auto text-sm underline underline-offset-4">
                Get a free key
              </a>
            </div>
            {msg && (
              <p role="status" className={`text-sm ${msg.ok ? "" : "text-[#D0594A]"}`}>
                {msg.text}
              </p>
            )}
            <p className="text-xs text-muted">
              The key is checked with TMDB, then stored in an HTTP-only cookie in this browser. It is only ever sent to this app&apos;s server. A key saved here overrides the one in .env.local.
            </p>
          </div>
        </section>
      </div>
    </dialog>
  );
}
