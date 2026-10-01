import { evidence } from "@/evidence";
import { fmtPp, fmtRange } from "@/evidence/format";

export interface ForestRow {
  label: string;
  point: number;
  lo: number;
  hi: number;
}

/** One axis for every plot on the page, so bar lengths can be compared between cards. */
const STEP = 4;
const all = evidence.contrasts.flatMap((c) => [c.lo, c.hi]);
export const DOMAIN: [number, number] = [Math.floor(Math.min(0, ...all) / STEP) * STEP, Math.ceil(Math.max(0, ...all) / STEP) * STEP];
const TICKS: number[] = [];
for (let t = DOMAIN[0]; t <= DOMAIN[1]; t += STEP) TICKS.push(t);
const pos = (v: number) => ((v - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * 100;

export function ForestPlot({ rows, title, leftLabel, rightLabel }: { rows: ForestRow[]; title: string; leftLabel: string; rightLabel: string }) {
  return (
    <figure className="m-0" aria-label={title}>
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-0">
          {TICKS.map((t) => (
            <div key={t} className={`absolute inset-y-0 ${t === 0 ? "w-0.5 bg-fg/70" : "w-px bg-line"}`} style={{ left: `${pos(t)}%` }} />
          ))}
        </div>
        <ul className="relative m-0 list-none space-y-1 p-0">
          {rows.map((r, i) => {
            const excl = r.lo > 0 || r.hi < 0;
            const aria = `${r.label}: ${fmtPp(r.point)} points, likely range ${fmtRange(r.lo, r.hi)}. ${excl ? "The range stays on one side of zero." : "The range crosses zero."}`;
            return (
              <li key={r.label + i} aria-label={aria} className="pb-1">
                <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="rounded bg-card/90 px-1 font-medium">{r.label}</span>
                  <strong className={`rounded bg-card/90 px-1 tabular-nums ${excl ? "text-accent" : ""}`}>{fmtPp(r.point)}</strong>
                  <span className="rounded bg-card/90 px-1 text-xs tabular-nums text-muted">{fmtRange(r.lo, r.hi)}</span>
                </p>
                <div aria-hidden className="relative h-6">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-full ${excl ? "h-2.5 bg-accent" : "h-1.5 bg-info/50"}`}
                    style={{ left: `${pos(r.lo)}%`, width: `${pos(r.hi) - pos(r.lo)}%` }}
                  />
                  <div
                    className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${excl ? "border-accent bg-accent" : "border-info bg-card"}`}
                    style={{ left: `${pos(r.point)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div aria-hidden className="relative mt-1 h-5 text-xs tabular-nums text-muted">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>
            {t > 0 ? `+${t}` : t}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>← {leftLabel}</span>
        <span>{rightLabel} →</span>
      </div>
    </figure>
  );
}

export function PlotLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-accent bg-accent" /> Range stays on one side of zero
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-info bg-card" /> Range crosses zero (no clear difference)
      </span>
    </p>
  );
}
