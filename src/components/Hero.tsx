import { BudgetBar, Cards, PICKS, type StripPolicy } from "./MiniCards";
import { copy } from "@/copy/en";

const ROWS: { id: StripPolicy; note: string }[] = [
  { id: "random", note: "scattered" },
  { id: "quality", note: "tallest cards" },
  { id: "diversity", note: "every colour" },
];

/** Same twenty cards, same budget. Each strategy lights up a different six. */
export function Hero() {
  return (
    <div aria-hidden className="rounded-3xl border border-line p-4 shadow-sm sm:p-6" style={{ background: "var(--hero-bg)" }}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Same cards. Same budget. Different picks.</p>
      <div className="space-y-5">
        {ROWS.map((r) => (
          <div key={r.id}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-bold">{copy.policies[r.id].name}</span>
              <span className="text-xs text-muted">{r.note}</span>
            </div>
            <Cards picks={PICKS[r.id]} />
            <div className="mt-2">
              <BudgetBar />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
