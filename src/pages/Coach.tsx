import { AlertTriangle, Brain, Calculator, CheckCircle2, Compass, FileUp, ListChecks, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, PageTitle } from "@/components/ui";
import { copy } from "@/copy/en";
import type { Goal } from "@/evidence/recommend";
import { fmtInt } from "@/evidence/format";
import { LIMITS } from "@/io/parse";
import { useStore } from "@/state/store";

const GOALS: Goal[] = ["instructions", "reasoning", "math", "unsure"];
const GOAL_ICON = { instructions: ListChecks, reasoning: Brain, math: Calculator, unsure: Compass } as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex gap-2" aria-label="Progress">
      {copy.coach.stepLabels.map((l, i) => (
        <li key={l} aria-current={i === current ? "step" : undefined} className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium ${i === current ? "bg-accent text-accent-fg" : i < current ? "bg-accent-soft text-accent" : "bg-line text-muted"}`}>
          {l}
        </li>
      ))}
    </ol>
  );
}

function GoalStep({ onNext }: { onNext: () => void }) {
  const { goal, setGoal } = useStore();
  return (
    <>
      <PageTitle>{copy.coach.goalTitle}</PageTitle>
      <div role="radiogroup" aria-label={copy.coach.goalTitle} className="grid gap-4 sm:grid-cols-2">
        {GOALS.map((g) => {
          const on = goal === g;
          const Icon = GOAL_ICON[g];
          return (
            <button
              key={g}
              role="radio"
              aria-checked={on}
              onClick={() => {
                setGoal(g);
                onNext();
              }}
              className={`group rounded-2xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${on ? "border-accent bg-accent-soft" : "border-line bg-card"}`}
            >
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent group-hover:bg-accent group-hover:text-accent-fg">
                <Icon aria-hidden size={22} />
              </span>
              <span className="block text-lg font-bold">{copy.coach.goals[g].t}</span>
              <span className="mt-1 block text-sm text-muted">“{copy.coach.goals[g].e}”</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HealthCard() {
  const { health, analysis, parse } = useStore();
  if (!health || !analysis || !parse) return null;
  const skippedTotal = health.skipped.reduce((a, s) => a + s.count, 0);
  const issues = health.skipped.length + health.review.length;
  return (
    <Card className="mt-6" as="section">
      <div className="flex items-start gap-3">
        {issues === 0 ? <CheckCircle2 aria-hidden className="mt-1 shrink-0 text-accent" /> : <AlertTriangle aria-hidden className="mt-1 shrink-0 text-warn" />}
        <div>
          <h2 className="text-xl font-bold">{issues === 0 ? copy.coach.healthy : copy.coach.worthALook(issues)}</h2>
          {health.usable === 0 ? (
            <p className="mt-1 text-muted">{copy.coach.nothingUsable}</p>
          ) : (
            <p className="mt-1" data-testid="usable-line">{copy.coach.usableLine(health.usable, skippedTotal)}</p>
          )}
          <p className="mt-1 text-sm text-muted">{analysis.tokenizer === "qwen-real" ? copy.coach.tokenizerReal : copy.coach.tokenizerEstimate}</p>
        </div>
      </div>
      {health.total > 0 && (
        <div className="mt-4" role="img" aria-label={`${health.usable} usable, ${skippedTotal} skipped`}>
          <div className="flex h-3 overflow-hidden rounded-full bg-line">
            <div className="bg-accent" style={{ width: `${(health.usable / health.total) * 100}%` }} />
            <div className="bg-warn" style={{ width: `${(skippedTotal / health.total) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>Usable</span>
            <span>Skipped</span>
          </div>
        </div>
      )}
      {health.englishOnly && <p role="alert" className="mt-4 rounded-lg bg-warn-soft p-3 text-warn">{copy.coach.englishOnly}</p>}
      {parse.truncated && <p className="mt-3 text-sm text-warn">{copy.coach.truncated}</p>}
      {health.skipped.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {health.skipped.map((s) => (
            <li key={s.code} className="py-2">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span>{copy.coach.skip[s.code]}</span>
                  <span className="font-semibold tabular-nums">{fmtInt(s.count)}</span>
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {s.examples.map((e, i) => (
                    <li key={i} className="break-words">
                      {"line" in e ? `Line ${e.line}: ` : `Row ${e.row + 1}: `}
                      {e.preview}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      {health.review.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {health.review.map((r) => (
            <li key={r.code}>
              {copy.coach.review[r.code]}: <span className="tabular-nums">{fmtInt(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DataStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { loadText, loadSample, parse, analysis, analyzing, progress, error, fileName } = useStore();
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const takeFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > LIMITS.maxBytes) return void loadText("", f.name, f.size);
    await loadText(await f.text(), f.name, f.size);
  };
  const badFormat = parse && parse.rows.length === 0 && !parse.tooBig && parse.format !== "empty";
  return (
    <>
      <PageTitle>{copy.coach.dataTitle}</PageTitle>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void takeFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${drag ? "border-accent bg-accent-soft" : "border-line bg-card"}`}
      >
        <FileUp aria-hidden className="mx-auto text-accent" size={32} />
        <p className="mt-3 text-lg font-semibold">{copy.coach.dropEmpty}</p>
        <p className="mt-1 break-all text-xs text-muted">{copy.coach.dropHint}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={() => input.current?.click()}>{copy.coach.browse}</Button>
          <Button onClick={() => void loadSample()}>{copy.coach.sample}</Button>
        </div>
        <input ref={input} type="file" accept=".jsonl,.json,.txt,application/json" className="sr-only" aria-label={copy.coach.browse} onChange={(e) => void takeFile(e.target.files?.[0])} />
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted">{copy.coach.paste}</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={copy.coach.pastePlaceholder} rows={5} aria-label={copy.coach.pastePlaceholder} className="mt-2 w-full rounded-xl border border-line bg-card p-3 font-mono text-sm" />
        <Button variant="secondary" className="mt-2" disabled={!paste.trim()} onClick={() => void loadText(paste, "pasted.jsonl")}>{copy.coach.usePasted}</Button>
      </details>

      {analyzing && (
        <p role="status" className="mt-6 flex items-center gap-2 text-muted">
          <Loader2 aria-hidden className="animate-spin" /> {progress ? copy.coach.stages[progress.stage] : copy.coach.stages.reading}
          {progress && progress.total > 0 && progress.stage !== "reading" ? ` ${Math.round((progress.done / progress.total) * (progress.stage === "downloading" ? 1 : 100))}%` : ""}
        </p>
      )}
      {parse?.tooBig && <p role="alert" className="mt-6 rounded-lg bg-warn-soft p-3 text-warn">{copy.coach.tooBig}</p>}
      {badFormat && (
        <div role="alert" className="mt-6 rounded-lg bg-warn-soft p-3 text-warn">
          <p>{copy.coach.badFormat}</p>
          <pre className="mt-2 overflow-x-auto text-xs">{copy.coach.badFormatExample}</pre>
        </div>
      )}
      {error && <p role="alert" className="mt-6 rounded-lg bg-warn-soft p-3 text-warn">{error}</p>}
      {fileName && analysis && <p className="mt-6 text-sm text-muted">{fileName}</p>}
      {!analyzing && <HealthCard />}

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={onBack}>{copy.coach.back}</Button>
        <Button disabled={!analysis || analysis.usableRows === 0 || analysis.availableTokens < 1} onClick={onNext}>{copy.coach.next}</Button>
      </div>
    </>
  );
}

const PRESETS = [
  { id: "quick", tokens: 100_000 },
  { id: "standard", tokens: 300_000 },
  { id: "study", tokens: 1_000_000 },
] as const;

function SizeStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { analysis, target, setTarget, advanced, setAdvanced, reanalyze } = useStore();
  if (!analysis) return null;
  const max = analysis.availableTokens;
  const min = Math.min(1000, max);
  const step = max > 20_000 ? 1000 : 100;
  return (
    <>
      <PageTitle sub={copy.coach.sizeSub}>{copy.coach.sizeTitle}</PageTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {PRESETS.map((p) => {
          const disabled = p.tokens > max;
          return (
            <button key={p.id} disabled={disabled} onClick={() => setTarget(p.tokens)} aria-pressed={target === p.tokens} className={`rounded-2xl border-2 p-4 text-left transition ${disabled ? "cursor-not-allowed border-dashed border-line bg-transparent text-muted" : target === p.tokens ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-accent"}`}>
              <span className="block font-semibold">{copy.coach.presets[p.id]}</span>
              <span className="block text-2xl font-bold tabular-nums">{fmtInt(p.tokens)}</span>
              {disabled && (
                <span className="mt-1 flex items-center gap-1 text-xs">
                  <Lock aria-hidden size={12} /> {copy.coach.presetDisabled}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-8">
        <label htmlFor="size" className="block text-lg font-semibold">
          {fmtInt(target)} tokens
        </label>
        <input id="size" type="range" min={min} max={max} step={step} value={Math.min(target, max)} onChange={(e) => setTarget(Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
          <span>{fmtInt(min)}</span>
          <span>{fmtInt(max)}</span>
        </div>
        <p className="mt-2 text-sm text-muted">{copy.coach.available(fmtInt(max))}</p>
        <p className="mt-1 text-sm text-muted">{copy.coach.timeHint}</p>
      </div>

      <details className="mt-8 rounded-xl border border-line bg-card p-4">
        <summary className="cursor-pointer font-medium">{copy.coach.advanced}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {copy.coach.seed}
            <input type="number" value={advanced.seed} onChange={(e) => setAdvanced({ seed: Math.trunc(Number(e.target.value)) || 0 })} className="mt-1 block w-full rounded-lg border border-line bg-bg p-2" />
          </label>
          <label className="text-sm">
            {copy.coach.cap}
            <select value={advanced.cap} onChange={(e) => setAdvanced({ cap: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-line bg-bg p-2">
              <option value={250}>250 (faster)</option>
              <option value={1000}>1,000</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={advanced.exactFit} onChange={(e) => setAdvanced({ exactFit: e.target.checked })} /> {copy.coach.exactFit}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={advanced.keepWhitespace} onChange={(e) => setAdvanced({ keepWhitespace: e.target.checked })} /> {copy.coach.whitespace}
          </label>
        </div>
        <Button variant="secondary" className="mt-4" onClick={() => void reanalyze()}>Apply and recheck data</Button>
      </details>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={onBack}>{copy.coach.back}</Button>
        <Button onClick={onNext} disabled={max < 1}>{copy.coach.next}</Button>
      </div>
    </>
  );
}

function RunStep({ onBack }: { onBack: () => void }) {
  const nav = useNavigate();
  const { run, running, progress, cancel, error } = useStore();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run().then((ok) => ok && nav("/report"));
  }, [run, nav]);
  const stages = ["reading", "counting", "checking", "picking", "comparing"] as const;
  const idx = progress ? stages.indexOf(progress.stage as (typeof stages)[number]) : 0;
  return (
    <>
      <PageTitle sub={copy.coach.slowPhone}>{copy.coach.running}</PageTitle>
      <Card>
        <ol className="space-y-2">
          {stages.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i < idx ? "text-accent" : i === idx && running ? "font-semibold" : "text-muted"}`}>
              {i < idx ? <CheckCircle2 aria-hidden size={18} /> : i === idx && running ? <Loader2 aria-hidden className="animate-spin" size={18} /> : <span className="inline-block h-4 w-4 rounded-full border border-line" />}
              {copy.coach.stages[s]}
            </li>
          ))}
        </ol>
        {progress?.stage === "downloading" && (
          <p role="status" className="mt-4 text-sm text-muted">
            {copy.coach.modelConsent} {progress.total ? Math.round(progress.done) : 0}%
          </p>
        )}
        <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0} className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 5}%` }} />
        </div>
      </Card>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>{copy.coach.back}</Button>
        {running && (
          <Button variant="secondary" onClick={() => { cancel(); onBack(); }}>{copy.coach.cancel}</Button>
        )}
      </div>
    </>
  );
}

export function Coach() {
  const [step, setStep] = useState(0);
  const { goal, analysis, parse } = useStore();
  useEffect(() => {
    if (goal && step === 0 && (analysis || parse)) setStep(1);
  }, [goal, analysis, parse, step]);
  return (
    <div className="mx-auto max-w-2xl">
      <Steps current={step} />
      <div key={step} className="step-in">
        {step === 0 && <GoalStep onNext={() => setStep(1)} />}
        {step === 1 && <DataStep onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {step === 2 && <SizeStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <RunStep onBack={() => setStep(2)} />}
      </div>
    </div>
  );
}
