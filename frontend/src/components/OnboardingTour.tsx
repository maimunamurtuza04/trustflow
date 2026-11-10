import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Compass, X } from "lucide-react";
import { api } from "../lib/api";
import { TOURS, type TourStep } from "../lib/tour";
import type { Role } from "../lib/types";

interface TourState {
  tour_key: string;
  status: "not_started" | "in_progress" | "completed" | "skipped";
  current_step: number;
  should_auto_start: boolean;
}

const REPLAY_EVENT = "trustflow:replay-tour";
let replayRequested = false;

export function requestTourReplay() {
  // The flag survives a route change to the dashboard, which mounts after the event fires.
  replayRequested = true;
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

export function useOnboarding(role: Role) {
  const [state, setState] = useState<TourState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<TourState>(`/onboarding/${role}`)
      .then((result) => {
        if (!active) return;
        setState(result);
        if (result.should_auto_start || replayRequested) {
          replayRequested = false;
          setOpen(true);
        }
      })
      .catch(() => {
        // Onboarding is non-critical; a failure must never block the dashboard.
      });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(REPLAY_EVENT, handler);
    return () => window.removeEventListener(REPLAY_EVENT, handler);
  }, []);

  const persist = useCallback(
    (status: TourState["status"], step: number) => {
      api.put<TourState>(`/onboarding/${role}`, { status, current_step: step }).catch(() => undefined);
    },
    [role],
  );

  const finish = useCallback(
    (step: number) => {
      setOpen(false);
      persist("completed", step);
    },
    [persist],
  );

  const skip = useCallback(
    (step: number) => {
      setOpen(false);
      persist("skipped", step);
    },
    [persist],
  );

  const progress = useCallback((step: number) => persist("in_progress", step), [persist]);

  return {
    role,
    steps: TOURS[role],
    open,
    start: () => setOpen(true),
    finish,
    skip,
    progress,
    seen: Boolean(state && state.status !== "not_started"),
  };
}

function useTargetRect(step: TourStep | undefined, active: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }
    const target = document.querySelector(step.selector);
    if (target) target.scrollIntoView({ block: "center", inline: "nearest" });
    const measure = () => {
      const element = document.querySelector(step.selector);
      setRect(element ? element.getBoundingClientRect() : null);
    };
    measure();
    const timer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  return rect;
}

export function TourOverlay({
  steps,
  open,
  onFinish,
  onSkip,
  onProgress,
}: {
  steps: TourStep[];
  open: boolean;
  onFinish: (step: number) => void;
  onSkip: (step: number) => void;
  onProgress?: (step: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, index]);

  const step = steps[index];
  const last = index === steps.length - 1;
  const rect = useTargetRect(step, open);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(steps.length - 1, next));
      setIndex(clamped);
      onProgress?.(clamped);
    },
    [onProgress, steps.length],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip(index);
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, index, onSkip, open]);

  if (!open || !step) return null;

  const pad = 8;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="pointer-events-auto absolute rounded-xl border-2 border-emerald-400/80 transition-all duration-200"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.82)",
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-navy-950/85" aria-hidden="true" />
      )}

      <div className="absolute inset-x-3 bottom-4 mx-auto max-w-lg sm:bottom-6">
        <div className="rounded-2xl border border-emerald-400/25 bg-navy-900 p-5 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                <Compass className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                Guided tour · {index + 1} of {steps.length}
              </p>
            </div>
            <button
              className="btn-ghost -mr-1 -mt-1 rounded-lg p-1.5 text-slate-400"
              onClick={() => onSkip(index)}
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h2 className="mt-3 text-base font-semibold text-white">{step.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{step.body}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {steps.map((_, dot) => (
                <span
                  key={dot}
                  className={`h-1.5 rounded-full transition-all ${
                    dot === index ? "w-5 bg-emerald-400" : "w-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost px-3 py-2 text-xs text-slate-300" onClick={() => onSkip(index)}>
                Skip tour
              </button>
              {index > 0 ? (
                <button className="btn-secondary px-3 py-2 text-xs" onClick={() => go(index - 1)}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              ) : null}
              <button
                ref={nextRef}
                className="btn-primary px-3 py-2 text-xs"
                onClick={() => (last ? onFinish(index) : go(index + 1))}
              >
                {last ? "Finish" : "Next"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-600">Use ← → to step through, Esc to skip.</p>
        </div>
      </div>
    </div>
  );
}

export function GettingStarted({ items }: { items: { label: string; done: boolean }[] }) {
  const done = items.filter((item) => item.done).length;
  if (items.length === 0 || done === items.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Getting started · {done}/{items.length}
        </p>
        <button className="link text-[11px]" onClick={requestTourReplay}>
          Replay tour
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[11px] leading-relaxed">
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
            )}
            <span className={item.done ? "text-slate-500 line-through" : "text-slate-300"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
