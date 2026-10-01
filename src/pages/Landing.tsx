import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Hero } from "@/components/Hero";
import { Button, Card } from "@/components/ui";
import { HELPS_SENTENCE, PAPER_TITLE, copy } from "@/copy/en";
import { evidence } from "@/evidence";
import { fmtPp, fmtRange } from "@/evidence/format";
import { contrastsFor } from "@/evidence/recommend";
import { useStore } from "@/state/store";

function MiniRange({ lo, hi, point }: { lo: number; hi: number; point: number }) {
  const min = -6;
  const max = 16;
  const pos = (v: number) => `${((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100}%`;
  const excl = lo > 0 || hi < 0;
  return (
    <div aria-hidden className="relative mt-3 h-5">
      <div className="absolute inset-y-0 w-px bg-fg/60" style={{ left: pos(0) }} />
      <div className={`absolute top-1/2 -translate-y-1/2 rounded-full ${excl ? "h-2 bg-accent" : "h-1.5 bg-info/50"}`} style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      <div className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${excl ? "border-accent bg-accent" : "border-info bg-card"}`} style={{ left: pos(point) }} />
    </div>
  );
}

function Tile({ title, body, metric }: { title: string; body: string; metric: "ifeval_prompt_strict" | "bbh_accuracy" | "gsm8k_accuracy" }) {
  const c = contrastsFor(evidence, "diversity", metric, ["primary-2seed"])[0]!;
  return (
    <Card as="article">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <p className={`mt-2 text-5xl font-extrabold tabular-nums ${c.lo > 0 || c.hi < 0 ? "text-accent" : "text-info"}`}>{fmtPp(c.point)}</p>
      <MiniRange lo={c.lo} hi={c.hi} point={c.point} />
      <p className="text-xs text-muted">
        {copy.landing.points} · {copy.evidence.likelyRange} {fmtRange(c.lo, c.hi)}
      </p>
      <p className="mt-3 text-sm">{body}</p>
    </Card>
  );
}

export function Landing() {
  const nav = useNavigate();
  const { reset, loadSample } = useStore();
  const start = (sample: boolean) => {
    reset();
    nav("/coach", { state: { sample } });
    if (sample) void loadSample();
  };
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
            {copy.landing.basedOn}: {PAPER_TITLE}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">{copy.landing.title}</h1>
          <p className="mt-4 text-lg text-muted">{copy.landing.subtitle}</p>
          <p className="mt-5 border-l-4 border-accent pl-4 text-base text-muted" data-testid="helps-sentence">
            {HELPS_SENTENCE}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => start(true)}>
              {copy.landing.cta} <ArrowRight aria-hidden size={18} />
            </Button>
            <Button variant="secondary" onClick={() => start(false)}>
              {copy.landing.ctaOwn}
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden size={16} /> {copy.landing.privacy}
          </p>
        </div>
        <Hero />
      </section>

      <section aria-labelledby="glance">
        <h2 id="glance" className="text-2xl font-bold">{copy.landing.glance}</h2>
        <p className="mt-1 text-muted">{copy.landing.glanceNote}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Tile title={copy.landing.tileInstr} body={copy.landing.tileInstrBody} metric="ifeval_prompt_strict" />
          <Tile title={copy.landing.tileReason} body={copy.landing.tileReasonBody} metric="bbh_accuracy" />
          <Tile title={copy.landing.tileMath} body={copy.landing.tileMathBody} metric="gsm8k_accuracy" />
        </div>
        <p className="mt-3 text-sm">
          <Link className="text-accent underline underline-offset-4" to="/evidence">{copy.report.seeEvidence}</Link>
        </p>
      </section>

      <section aria-labelledby="steps">
        <h2 id="steps" className="text-2xl font-bold">{copy.landing.stepsTitle}</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {copy.landing.steps.map((s, i) => (
            <li key={s.t}>
              <Card className="h-full">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
                <p className="mt-1 text-muted">{s.d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
