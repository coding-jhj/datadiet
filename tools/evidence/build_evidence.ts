/**
 * Build src/evidence/evidence.generated.json from the vendored paper package.
 *
 * Every number the app shows about the study comes from this file, and this
 * file comes from data/paper/**. Nothing here is typed by hand.
 *
 * Run:  npm run evidence
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EvidenceSchema, type Evidence, type MetricId, type PolicyId } from "../../src/evidence/schema.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PAPER = join(ROOT, "data/paper");
const OUT = join(ROOT, "src/evidence/evidence.generated.json");

const vendored = JSON.parse(readFileSync(join(PAPER, "VENDORED.json"), "utf8")) as {
  source_package: string;
  files: Record<string, string>;
};

const usedFiles = new Set<string>();
function readText(rel: string): string {
  usedFiles.add(rel);
  return readFileSync(join(PAPER, rel), "utf8");
}
function readJson<T = any>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}

/** Minimal RFC-4180 style CSV parser (handles quoted commas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
const csv = (rel: string) => parseCsv(readText(rel));

const pp = (fraction: number) => Number((fraction * 100).toFixed(6));
const num = (s: string | undefined, what: string) => {
  const v = Number(s);
  if (s === undefined || s === "" || Number.isNaN(v)) throw new Error(`Missing number: ${what}`);
  return v;
};

const METRICS: MetricId[] = ["ifeval_prompt_strict", "ifeval_instruction_strict", "gsm8k_accuracy", "bbh_accuracy"];
const POLICIES: PolicyId[] = ["random", "quality", "diversity"];

// ---------- conditions ----------
const cfg = readJson(`configs/selection_config.json`);
const analysisMeta = readJson(`results/analysis_metadata.json`);
const runFiles = readdirSync(join(PAPER, "data/run_summaries")).filter((f) => f.endsWith(".json")).sort();
const runSummaries = runFiles.map((f) => ({ file: f, data: readJson(`data/run_summaries/${f}`) }));
const modelId: string = runSummaries[0]!.data.model;

// ---------- means (2-seed, percent) ----------
const means2Seed: Evidence["means2Seed"] = {} as Evidence["means2Seed"];
for (const row of csv("results/strategy_metrics.csv")) {
  const policy = row.strategy as PolicyId;
  if (!POLICIES.includes(policy)) continue;
  const per: Record<string, { mean: number; sd: number }> = {};
  for (const m of METRICS) {
    per[m] = { mean: pp(num(row[`${m}_mean`], `${policy}.${m}.mean`)), sd: pp(num(row[`${m}_sd`], `${policy}.${m}.sd`)) };
  }
  (means2Seed as any)[policy] = per;
}

function singleRunMeans(rel: string, key: string): Record<MetricId, number> {
  const row = csv(rel).find((r) => r.strategy === key);
  if (!row) throw new Error(`No ${key} row in ${rel}`);
  return Object.fromEntries(METRICS.map((m) => [m, pp(num(row[`${m}_mean`], `${rel}:${m}`))])) as Record<MetricId, number>;
}
const meansFollowup: Evidence["meansFollowup"] = {
  seed2026: {
    random: singleRunMeans("results/results_seed2026_long_generation/strategy_metrics.csv", "random"),
    diversity: singleRunMeans("results/results_seed2026_long_generation/strategy_metrics.csv", "diversity"),
  },
  expanded: {
    random: singleRunMeans("results/results_expanded_long_generation/strategy_metrics.csv", "random"),
    diversity: singleRunMeans("results/results_expanded_long_generation/strategy_metrics.csv", "diversity"),
  },
  base: singleRunMeans("results/results_base_long_generation/strategy_metrics.csv", "base"),
};

// ---------- contrasts ----------
const contrasts: Evidence["contrasts"] = [];
const metricOf = (s: string): MetricId => {
  if (!METRICS.includes(s as MetricId)) throw new Error(`Unknown metric ${s}`);
  return s as MetricId;
};

for (const r of csv("results/paired_bootstrap.csv")) {
  const metric = metricOf(r.metric);
  contrasts.push({
    id: `${r.treatment}-vs-random/primary-2seed/${metric}`,
    protocol: "primary-2seed",
    treatment: r.treatment as PolicyId,
    control: "random",
    metric,
    seeds: [13, 42],
    n: num(r.n_paired_examples, "n"),
    point: pp(num(r.point_estimate, "point")),
    lo: pp(num(r.ci_95_lower, "lo")),
    hi: pp(num(r.ci_95_upper, "hi")),
  });
}

const perSeed: Evidence["perSeed"] = [];
for (const r of csv("results/results_seed_robustness/three_seed_paired_bootstrap.csv")) {
  const metric = metricOf(r.metric);
  const base = { metric, n: num(r.n_paired_examples, "n"), point: pp(num(r.point_estimate, "point")), lo: pp(num(r.ci_95_lower, "lo")), hi: pp(num(r.ci_95_upper, "hi")) };
  if (r.seed === "13,42,2026") {
    contrasts.push({
      id: `diversity-vs-random/mixed-3seed/${metric}`,
      protocol: "mixed-3seed",
      treatment: "diversity",
      control: "random",
      seeds: [13, 42, 2026],
      ...base,
    });
  } else {
    perSeed.push({ seed: Number(r.seed), ...base });
  }
}

function followupContrasts(rel: string, protocol: "seed2026-only" | "expanded-single-seed") {
  for (const r of csv(rel)) {
    const metric = metricOf(r.metric);
    contrasts.push({
      id: `${r.treatment}-vs-random/${protocol}/${metric}`,
      protocol,
      treatment: r.treatment as PolicyId,
      control: "random",
      metric,
      seeds: [2026],
      n: num(r.n_paired_examples, "n"),
      point: pp(num(r.point_estimate, "point")),
      lo: pp(num(r.ci_95_lower, "lo")),
      hi: pp(num(r.ci_95_upper, "hi")),
    });
  }
}
followupContrasts("results/results_seed2026_long_generation/paired_bootstrap.csv", "seed2026-only");
followupContrasts("results/results_expanded_long_generation/paired_bootstrap.csv", "expanded-single-seed");

// ---------- run stats ----------
const runs = runSummaries.map(({ file, data }) => {
  const m = /^main_(random|quality|diversity)_seed(\d+)\.json$/.exec(file);
  if (!m) throw new Error(`Unexpected run summary name ${file}`);
  return {
    strategy: m[1] as PolicyId,
    seed: Number(m[2]),
    rows: data.manifest_rows_loaded as number,
    optimizerSteps: data.optimizer_steps as number,
    tokensSeen: data.tokens_seen as number,
    minutes: Number((data.elapsed_seconds / 60).toFixed(1)),
  };
});
const gpu: string = runSummaries[0]!.data.device;
for (const run of runs) {
  if (run.tokensSeen !== cfg.target_tokens) throw new Error(`Run ${run.strategy}/${run.seed} did not see exactly ${cfg.target_tokens} tokens`);
}
// cross-check against selection manifest summaries
for (const run of runs) {
  const s = readJson(`data/selection_manifests/manifest_${run.strategy}_seed${run.seed}.summary.json`);
  if (s.actual_tokens !== cfg.target_tokens || !s.exact_budget) throw new Error(`Manifest ${run.strategy}/${run.seed} is not an exact budget`);
  const rowsBySource = Object.values(s.selected_rows_by_source as Record<string, number>).reduce((a, b) => a + b, 0);
  if (rowsBySource !== run.rows) throw new Error(`Row mismatch for ${run.strategy}/${run.seed}: ${rowsBySource} vs ${run.rows}`);
}
const rowsAll = runs.map((r) => r.rows);
const minutesAll = runs.map((r) => r.minutes);

// ---------- validity ----------
function validity(rel: string): { flagged: number; total: number } {
  const v = readJson(rel);
  let total = 0;
  const count = (files: Record<string, any>) => {
    for (const f of Object.values(files)) total += f.rows as number;
  };
  if (v.adapters) for (const a of Object.values<any>(v.adapters)) count(a.files);
  else count(v.files);
  return { flagged: v.possible_truncation_total as number, total };
}
const validityBlock = {
  primary: validity("results/validation.json"),
  seed2026: validity("results/results_seed2026_long_generation/validation.json"),
  expanded: validity("results/results_expanded_long_generation/validation.json"),
  base: validity("results/results_base_long_generation/validation.json"),
};

// ---------- misc ----------
const expandedValidation = readJson("results/results_expanded_long_generation/validation.json");
const seed2026Validation = readJson("results/results_seed2026_long_generation/validation.json");
const primaryValidation = readJson("results/validation.json");
const bbhWorstMax = Math.max(...csv("results/strategy_metrics.csv").map((r) => num(r.bbh_worst_task_mean, "bbh_worst")));
readText("results/results_seed_robustness/metadata.json");

const evidenceDraft: Evidence = {
  source: { packageName: vendored.source_package, files: {} },
  conditions: {
    model: modelId,
    dataset: cfg.dataset,
    datasetRevision: cfg.dataset_revision,
    tokenizer: cfg.tokenizer,
    embeddingModel: cfg.embedding_model,
    budgetTokens: cfg.target_tokens,
    maxLength: cfg.max_length,
    qualityFloor: cfg.quality_floor,
    candidateCapPerStratum: cfg.candidate_cap_per_stratum,
    language: "English",
    quantization: "4-bit NF4 QLoRA",
  },
  evalSubsets: {
    primary: primaryValidation.expected_rows,
    expanded: expandedValidation.expected_rows,
  },
  protocols: {
    primary: analysisMeta.max_new_tokens,
    followup: seed2026Validation.limits,
  },
  means2Seed,
  meansFollowup,
  contrasts,
  perSeed,
  runStats: {
    runs,
    rowsRange: [Math.min(...rowsAll), Math.max(...rowsAll)],
    minutesRange: [Math.min(...minutesAll), Math.max(...minutesAll)],
    gpu,
  },
  validity: validityBlock,
  bbhWorstTask: { maxAcrossPolicies: bbhWorstMax },
};

// hash every file we actually used, and confirm it equals the vendored manifest
for (const rel of [...usedFiles].sort()) {
  const expected = vendored.files[rel];
  if (!expected) throw new Error(`File ${rel} is not listed in VENDORED.json`);
  evidenceDraft.source.files[rel] = expected;
}

const evidence = EvidenceSchema.parse(evidenceDraft);
writeFileSync(OUT, JSON.stringify(evidence, null, 2) + "\n");
console.log(`evidence.generated.json written: ${evidence.contrasts.length} contrasts, ${evidence.runStats.runs.length} runs, ${Object.keys(evidence.source.files).length} source files`);
