/** Illustration only. The same 20 example cards (colour = topic, height = quality) are picked differently by each strategy. */
export const HUES = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 0, 2, 1, 3, 0, 2, 1, 3, 2, 0];
export const QUAL = [0.9, 0.5, 0.7, 0.6, 0.95, 0.4, 0.85, 0.55, 0.65, 0.92, 0.5, 0.8, 0.45, 0.7, 0.88, 0.6, 0.75, 0.5, 0.9, 0.4];
export const PICKS = {
  random: [2, 5, 8, 11, 13, 17],
  quality: [4, 9, 0, 18, 14, 6],
  diversity: [0, 9, 18, 4, 14, 16],
} as const;
export type StripPolicy = keyof typeof PICKS;

export function Cards({ picks, animate = true, height = 44 }: { picks: readonly number[]; animate?: boolean; height?: number }) {
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {HUES.map((h, i) => {
        const order = picks.indexOf(i);
        const picked = order >= 0;
        return (
          <span
            key={i}
            className={`flex-1 rounded-[5px] ${picked ? (animate ? "mc-picked" : "") : "mc-dim"}`}
            style={{ height: `${28 + QUAL[i]! * 72}%`, background: `var(--h${h + 1})`, ["--d" as string]: `${order * 0.35}s` }}
          />
        );
      })}
    </div>
  );
}

export function BudgetBar({ animate = true }: { animate?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full bg-accent ${animate ? "mc-bar" : ""}`} style={{ ["--w" as string]: "100%", width: animate ? undefined : "100%" }} />
    </div>
  );
}
