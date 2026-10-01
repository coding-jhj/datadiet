import { useState } from "react";
import { ForestPlot, PlotLegend } from "@/components/ForestPlot";
import { Card, PageTitle, Tip } from "@/components/ui";
import { PAPER_TITLE, copy } from "@/copy/en";
import { evidence } from "@/evidence";
import { fmtInt, fmtPct } from "@/evidence/format";
import { contrastsFor, PROTOCOL_ORDER } from "@/evidence/recommend";
import type { MetricId, ProtocolId } from "@/evidence/schema";

const METRICS: MetricId[] = ["ifeval_prompt_strict", "bbh_accuracy", "gsm8k_accuracy"];

export function Evidence() {
  const [protocol, setProtocol] = useState<ProtocolId | "all">("all");
  const protos = protocol === "all" ? PROTOCOL_ORDER : [protocol];
  const c = evidence.conditions;
  return (
    <div className="space-y-10">
      <PageTitle sub={copy.evidence.intro}>{copy.evidence.title}</PageTitle>
      <p className="-mt-4 text-sm text-muted">{PAPER_TITLE}</p>

      <Card as="section">
        <h2 className="text-lg font-bold">{copy.evidence.conditions}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">Model: </dt><dd className="inline">{c.model}</dd></div>
          <div><dt className="inline text-muted">Training: </dt><dd className="inline">{c.quantization}</dd></div>
          <div><dt className="inline text-muted">Budget: </dt><dd className="inline tabular-nums">{fmtInt(c.budgetTokens)} tokens</dd></div>
          <div><dt className="inline text-muted">Data: </dt><dd className="inline">{c.language}, {c.dataset}</dd></div>
          <div><dt className="inline text-muted">Test questions: </dt><dd className="inline tabular-nums">{evidence.evalSubsets.primary.ifeval} / {evidence.evalSubsets.primary.gsm8k} / {evidence.evalSubsets.primary.bbh}</dd></div>
        </dl>
      </Card>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{copy.evidence.protocolFilter}</legend>
        <div className="flex flex-wrap gap-2">
          {(["all", ...PROTOCOL_ORDER] as const).map((p) => (
            <label key={p} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${protocol === p ? "border-accent bg-accent-soft text-accent" : "border-line bg-card"}`}>
              <input type="radio" name="protocol" className="sr-only" checked={protocol === p} onChange={() => setProtocol(p)} />
              {p === "all" ? "All" : copy.evidence.protocols[p]}
            </label>
          ))}
        </div>
        {protocol !== "all" && <p className="mt-2 text-sm text-muted">{copy.evidence.protocolNote[protocol]}</p>}
      </fieldset>

      <section aria-labelledby="forest" className="space-y-6">
        <h2 id="forest" className="text-xl font-bold">{copy.evidence.plotTitle}</h2>
        <p className="text-sm text-muted">
          Difference in score, in percentage points. The bar is the <Tip label={copy.evidence.likelyRange} tip={copy.evidence.likelyRangeTip} />. All charts share one scale.
        </p>
        <PlotLegend />
        {METRICS.map((m) => {
          const rows = contrastsFor(evidence, "diversity", m, protos).map((x) => ({ label: copy.evidence.protocols[x.protocol], point: x.point, lo: x.lo, hi: x.hi }));
          return (
            <Card key={m} as="article">
              <h3 className="mb-2 font-semibold">{copy.evidence.metrics[m]}</h3>
              {rows.length ? <ForestPlot rows={rows} title={copy.evidence.metrics[m]} leftLabel={copy.evidence.random_higher} rightLabel={copy.evidence.varied_higher} /> : <p className="text-muted">No data for this protocol.</p>}
            </Card>
          );
        })}
      </section>

      <section aria-labelledby="quality">
        <h2 id="quality" className="mb-3 text-xl font-bold">{copy.evidence.qualityTitle}</h2>
        <Card>
          {METRICS.map((m) => {
            const rows = contrastsFor(evidence, "quality", m, ["primary-2seed"]).map((x) => ({ label: copy.evidence.protocols[x.protocol], point: x.point, lo: x.lo, hi: x.hi }));
            return rows.length ? (
              <div key={m} className="mb-4">
                <h3 className="font-semibold">{copy.evidence.metrics[m]}</h3>
                <ForestPlot rows={rows} title={copy.evidence.metrics[m]} leftLabel={copy.evidence.random_higher} rightLabel={copy.evidence.cleanest_higher} />
              </div>
            ) : null;
          })}
        </Card>
      </section>

      <Card as="section">
        <h2 className="text-lg font-bold">{copy.evidence.baseTitle}</h2>
        <p className="mt-2">{copy.evidence.baseBody}</p>
        <p className="mt-2 text-sm tabular-nums text-muted">
          {copy.evidence.metrics.ifeval_prompt_strict} {fmtPct(evidence.meansFollowup.base.ifeval_prompt_strict)} · {copy.evidence.metrics.gsm8k_accuracy} {fmtPct(evidence.meansFollowup.base.gsm8k_accuracy)} · {copy.evidence.metrics.bbh_accuracy} {fmtPct(evidence.meansFollowup.base.bbh_accuracy)}
        </p>
      </Card>

      <section id="limits" aria-labelledby="limits-h">
        <h2 id="limits-h" className="mb-3 text-xl font-bold">{copy.evidence.limitsTitle}</h2>
        <ul className="list-disc space-y-1 pl-6">
          {copy.evidence.limits.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p className="mt-3 text-sm text-muted tabular-nums">
          Answers flagged as possibly cut off by the length limit: {fmtInt(evidence.validity.primary.flagged)} of {fmtInt(evidence.validity.primary.total)} in the main test.
        </p>
      </section>

      <section aria-labelledby="src">
        <h2 id="src" className="mb-2 text-lg font-bold">{copy.evidence.source}</h2>
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">{Object.keys(evidence.source.files).length} files</summary>
          <ul className="mt-2 space-y-1 break-all font-mono text-xs text-muted">
            {Object.entries(evidence.source.files).map(([f, h]) => <li key={f}>{f} — {h.slice(0, 12)}</li>)}
          </ul>
        </details>
        <p className="mt-3"><a className="text-accent underline underline-offset-4" href="./paper/paper.pdf">{copy.evidence.paper}</a></p>
      </section>
    </div>
  );
}
