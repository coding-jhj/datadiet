import { ArrowRight } from "lucide-react";
import { BudgetBar, Cards, PICKS } from "@/components/MiniCards";
import { Card, PageTitle } from "@/components/ui";
import { copy } from "@/copy/en";

export function How() {
  return (
    <div className="space-y-10">
      <PageTitle>{copy.how.title}</PageTitle>
      <ol className="grid gap-4 md:grid-cols-4">
        {copy.how.flow.map((t, i) => (
          <li key={t} className="relative">
            <Card className="h-full">
              <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-bg p-3" aria-hidden>
                {i === 0 && (
                  <div className="relative h-16 w-24">
                    {[0, 1, 2, 3].map((k) => (
                      <span key={k} className="absolute h-12 w-20 rounded-lg border border-line bg-card shadow-sm" style={{ left: k * 5, top: k * 4, borderLeft: `5px solid var(--h${k + 1})` }} />
                    ))}
                  </div>
                )}
                {i === 1 && (
                  <div className="w-full">
                    <Cards picks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter((k) => ![3, 5, 8, 12, 17].includes(k))} animate={false} height={56} />
                    <p className="mt-1 text-center text-[11px] text-muted">faded = removed</p>
                  </div>
                )}
                {i === 2 && (
                  <div className="w-full space-y-1.5">
                    {(["random", "quality", "diversity"] as const).map((k) => (
                      <Cards key={k} picks={PICKS[k]} animate={false} height={16} />
                    ))}
                  </div>
                )}
                {i === 3 && (
                  <div className="w-full">
                    <Cards picks={PICKS.diversity} animate={false} height={36} />
                    <div className="mt-2"><BudgetBar animate={false} /></div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span>
                <p className="font-bold">{t}</p>
              </div>
              <p className="mt-1 text-sm text-muted">{copy.how.flowNotes[i]}</p>
            </Card>
            {i < 3 && <ArrowRight aria-hidden className="absolute -right-3.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-bg text-muted md:block" size={22} />}
          </li>
        ))}
      </ol>

      <section aria-labelledby="curious">
        <h2 id="curious" className="text-2xl font-bold">{copy.how.curious}</h2>
        <h3 className="mt-5 text-lg font-semibold">{copy.how.differences}</h3>
        <dl className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
          {copy.how.diffRows.map((r) => (
            <div key={r.a} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">{r.a}</dt>
              <dd className="text-muted">{r.b}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-8 text-lg font-semibold">{copy.how.fidelity}</h3>
        <dl className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
          {copy.how.fidelityRows.map((r) => (
            <div key={r.p} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">{r.p}</dt>
              <dd className="text-muted">{r.f}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
