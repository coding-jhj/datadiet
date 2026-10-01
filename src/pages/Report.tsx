import { Check, Download, ImageDown, Leaf, Sparkles } from "lucide-react";
import { useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, Card, TierBadge, Tip } from "@/components/ui";
import { copy } from "@/copy/en";
import { manifestCsv, summaryJson, trainingJsonl } from "@/engine/export";
import type { PolicyId } from "@/engine/types";
import { evidence } from "@/evidence";
import { fmtInt, fmtPp, fmtRange } from "@/evidence/format";
import { qualityVerdict, recommend, type Recommendation } from "@/evidence/recommend";
import { APP_VERSION, useStore } from "@/state/store";
import type { PolicyOutput, SelectionMap } from "@/workers/protocol";

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function verdictText(rec: Recommendation): string {
  if (rec.goal === "instructions") return copy.verdict.instructions;
  if (rec.goal === "reasoning") return copy.verdict.reasoning;
  if (rec.goal === "math") return rec.agreement === "all" ? copy.verdict.mathAll : copy.verdict.mathSome;
  return copy.verdict.unsure;
}

function Numbers({ rec }: { rec: Recommendation }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium underline underline-offset-4">{copy.report.showNumbers}</summary>
      <ul className="mt-2 space-y-1 rounded-xl bg-card p-4 text-fg">
        {rec.refs.map((c) => (
          <li key={c.id} className="tabular-nums">
            {copy.evidence.metrics[c.metric]} · {copy.evidence.protocols[c.protocol]}: {fmtPp(c.point)} pp, <Tip label={copy.evidence.likelyRange} tip={copy.evidence.likelyRangeTip} /> {fmtRange(c.lo, c.hi)}
          </li>
        ))}
      </ul>
    </details>
  );
}


const POLICIES: PolicyId[] = ["random", "quality", "diversity"];

function overlapPct(a: PolicyOutput, b: PolicyOutput): number {
  const ids = new Set(a.selected.map((r) => r.exampleId));
  let shared = 0;
  for (const r of b.selected) if (ids.has(r.exampleId)) shared++;
  return Math.round((shared / Math.max(1, Math.min(a.selected.length, b.selected.length))) * 100);
}

function SelectionMapView({ map, results }: { map: SelectionMap; results: Partial<Record<PolicyId, PolicyOutput>> }) {
  const cols = map.total.length > 180 ? 60 : map.total.length > 60 ? 30 : 12;
  return (
    <div className="space-y-4">
      {POLICIES.map((id) => {
        const picked = map.picked[id];
        const out = results[id];
        if (!picked || !out) return null;
        return (
          <div key={id}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{copy.policies[id].name}</span>
              <span className="tabular-nums text-muted">{fmtInt(out.selected.length)}</span>
            </div>
            <div role="img" aria-label={`${copy.policies[id].name}: ${fmtInt(out.selected.length)} examples picked`} className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {map.total.map((t, i) => {
                const f = t ? picked[i]! / t : 0;
                return <span key={i} className="aspect-square rounded-[2px] bg-line" style={f > 0 ? { background: "var(--accent)", opacity: 0.2 + 0.8 * f } : undefined} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PolicyCard({ id, out, recommended, skipReason }: { id: PolicyId; out?: PolicyOutput; recommended: boolean; skipReason?: string }) {
  const q = id === "quality" ? qualityVerdict(evidence) : null;
  return (
    <Card as="article" className={recommended ? "ring-2 ring-accent" : ""}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">{copy.policies[id].name}</h3>
        {recommended && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-fg">{copy.report.recommended}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{copy.policies[id].line}</p>
      {out ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">{copy.report.rows}</dt>
            <dd className="text-xl font-bold tabular-nums">{fmtInt(out.selected.length)}</dd>
          </div>
          <div>
            <dt className="text-muted">{copy.report.used}</dt>
            <dd className="text-xl font-bold tabular-nums">{fmtInt(out.usedTokens)}</dd>
          </div>
          <div className="col-span-2"><dt className="sr-only">Budget</dt><dd className="text-muted">{out.exact ? copy.report.exact : copy.report.close}</dd></div>
          {id === "diversity" && out.topicsTotal ? (
            <div className="col-span-2">
              <dt className="text-muted">{copy.report.topics}</dt>
              <dd className="mt-1">
                <div className="h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${out.topicsCovered} of ${out.topicsTotal}`}>
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, ((out.topicsCovered ?? 0) / out.topicsTotal) * 100)}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted">{out.topicsCovered} / {out.topicsTotal}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{skipReason ?? copy.coach.modelFailed}</p>
      )}
      {q && (
        <div className="mt-4 space-y-2">
          <TierBadge tier={q.tier} />
          <p className="text-sm">{copy.verdict.quality}</p>
        </div>
      )}
    </Card>
  );
}

export function Report() {
  const { output, meta, analysis, reset } = useStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  if (!output || !meta || !analysis) return <Navigate to="/coach" replace />;

  const rec = recommend(meta.goal, evidence);
  const fellBack = !output.results[rec.policy];
  const chosen: PolicyId = fellBack ? "random" : rec.policy;
  const pick = output.results[chosen]!;
  const cfg = { targetTokens: meta.target, seed: meta.advanced.seed, poolSeed: 0, qualityFloor: 0.55, candidateCapPerStratum: meta.advanced.cap, maxLength: 2048, exactFit: meta.advanced.exactFit };
  const summaryMeta = { tokenCounter: meta.tokenizer, whitespace: meta.advanced.keepWhitespace ? ("keep" as const) : ("collapse" as const), appVersion: APP_VERSION };
  const asResult = (o: PolicyOutput) => ({ ...o, fillerIds: new Set(o.fillerIds) });

  const saveImage = async () => {
    if (!cardRef.current) return;
    const { toPng } = await import("html-to-image");
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#ffffff";
    const url = await toPng(cardRef.current, { backgroundColor: bg, pixelRatio: 2, skipFonts: true });
    const a = document.createElement("a");
    a.href = url;
    a.download = "datadiet-report-card.png";
    a.click();
  };

  const others = POLICIES.filter((id) => id !== chosen);
  const overlapText =
    output.results.random && output.results.diversity
      ? `Random mix and Clean + varied share ${overlapPct(output.results.random, output.results.diversity)}% of their picks.`
      : null;

  return (
    <div className="step-in space-y-8">
      <div ref={cardRef} className="space-y-8 bg-bg p-1 sm:p-2">
        <header>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent">
            <Leaf aria-hidden size={16} /> {copy.report.title}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl" data-testid="headline">{copy.report.headline(pick.selected.length)}</h1>
          <p className="mt-2 text-muted tabular-nums">
            {fmtInt(pick.usedTokens)} tokens · {pick.exact ? copy.report.exact : copy.report.close}
          </p>
        </header>

        <section aria-labelledby="pick" className="rounded-3xl bg-accent p-6 text-accent-fg shadow-md sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-fg px-3 py-1 text-sm font-bold text-accent">
              <Check aria-hidden size={14} /> {copy.report.recommended}
            </span>
            <TierBadge tier={fellBack ? "unclear" : rec.tier} />
            {rec.interpretation && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent-fg/50 px-2.5 py-0.5 text-xs" title={copy.verdict.ourReadingTip}>
                <Sparkles aria-hidden size={12} /> {copy.verdict.ourReading}
              </span>
            )}
          </div>
          <h2 id="pick" className="mt-4 text-2xl font-extrabold sm:text-3xl">{copy.policies[chosen].name}</h2>
          <p className="mt-2 max-w-2xl text-lg/relaxed">{fellBack ? copy.verdict.fallbackRandom : verdictText(rec)}</p>
          <div className="mt-4">
            <Numbers rec={rec} />
          </div>
          <p className="mt-4 text-sm">
            <Link to="/evidence" className="underline underline-offset-4">{copy.report.seeEvidence}</Link>
          </p>
        </section>

        <section aria-labelledby="map" className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <h2 id="map" className="text-xl font-bold">Who picked what</h2>
            <p className="mb-4 mt-1 text-sm text-muted">Each square is a slice of your candidate examples. Darker means more of that slice was picked.</p>
            <SelectionMapView map={output.map} results={output.results} />
            {overlapText && <p className="mt-4 text-sm">{overlapText}</p>}
          </Card>
          <div className="space-y-4">
            {others.map((id) => (
              <PolicyCard key={id} id={id} out={output.results[id]} recommended={false} skipReason={output.skipped[id]} />
            ))}
          </div>
        </section>
        <p className="text-sm text-muted">
          {copy.report.factRows} ({fmtInt(evidence.runStats.rowsRange[0])}–{fmtInt(evidence.runStats.rowsRange[1])})
        </p>
      </div>

      {meta.tokenizer === "estimate" && <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">{copy.report.estimateNote}</p>}
      {meta.advanced.keepWhitespace && <p className="text-sm text-muted">{copy.report.keepNote}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save(`datadiet-${chosen}.jsonl`, trainingJsonl(pick.selected), "application/x-ndjson")}>
            <Download aria-hidden size={18} /> {copy.report.downloadFor(copy.policies[chosen].name)}
          </Button>
          <Button variant="secondary" onClick={() => void saveImage()}>
            <ImageDown aria-hidden size={18} /> {copy.report.saveImage}
          </Button>
          <Button variant="ghost" onClick={() => { reset(); nav("/coach"); }}>
            {copy.report.startOver}
          </Button>
        </div>
        <details className="rounded-xl border border-line bg-card p-4">
          <summary className="cursor-pointer font-medium">{copy.report.advancedExports}</summary>
          <div className="mt-3 space-y-4">
            {(["random", "quality", "diversity"] as PolicyId[]).map((id) => {
              const o = output.results[id];
              if (!o) return null;
              return (
                <div key={id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-36 font-medium">{copy.policies[id].name}</span>
                  <Button variant="secondary" className="min-h-10 px-3 py-1.5 text-sm" onClick={() => save(`datadiet-${id}.jsonl`, trainingJsonl(o.selected), "application/x-ndjson")}>JSONL</Button>
                  <Button variant="secondary" className="min-h-10 px-3 py-1.5 text-sm" onClick={() => save(`datadiet-${id}-manifest.csv`, manifestCsv(o.selected), "text/csv")}>{copy.report.manifest}</Button>
                  <Button variant="secondary" className="min-h-10 px-3 py-1.5 text-sm" onClick={() => save(`datadiet-${id}-summary.json`, summaryJson(asResult(o), cfg, analysis, summaryMeta), "application/json")}>{copy.report.summary}</Button>
                </div>
              );
            })}
            <p className="text-xs text-muted">{copy.report.fillers}: {fmtInt(pick.fillerIds.length)}</p>
          </div>
        </details>
        <p className="text-sm">
          <Link to="/evidence#limits" className="text-accent underline underline-offset-4">{copy.report.limits}</Link>
        </p>
      </section>
    </div>
  );
}
