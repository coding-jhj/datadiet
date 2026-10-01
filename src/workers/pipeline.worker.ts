import * as Comlink from "comlink";
import { diversityOrder, qualityOrder, randomOrder } from "@/engine/orders";
import { buildPool } from "@/engine/pool";
import { selectPolicy } from "@/engine/select";
import type { OrderFn, Pool, PolicyId, PoolRecord } from "@/engine/types";
import { hashEmbedder, loadMiniLM, makeDiversityDeps } from "@/ml/embedder";
import { clusterCount } from "@/engine/orders";
import { estimateProvider, loadTokenizerWithFallback, type TokenizerProvider } from "@/ml/tokenizer";
import type { AnalyzeInput, PoolSummary, ProgressEvent, PolicyOutput, SelectInput, SelectOutput, SelectionMap } from "./protocol";
import { cmpStr } from "@/engine/text";

let pool: Pool | null = null;
let analyzeInput: AnalyzeInput | null = null;
let embedderCache: Awaited<ReturnType<typeof loadMiniLM>> | null = null;

type Report = (e: ProgressEvent) => void;

const api = {
  async analyze(input: AnalyzeInput, report: Report): Promise<PoolSummary> {
    analyzeInput = input;
    let tokenizer: TokenizerProvider = estimateProvider;
    if (input.realTokenizer) {
      report({ stage: "downloading", done: 0, total: 1, note: "tokenizer" });
      tokenizer = await loadTokenizerWithFallback((p) => report({ stage: "downloading", done: p, total: 100, note: "tokenizer" }));
    }
    pool = buildPool(input.rows, (b) => tokenizer.count(b), {
      poolSeed: input.poolSeed,
      candidateCapPerStratum: input.candidateCap,
      maxLength: input.maxLength,
      whitespace: input.whitespace,
      onProgress: (done, total) => report({ stage: "counting", done, total }),
    });
    report({ stage: "checking", done: 1, total: 1 });
    const usableTokens = Object.values(pool.stratumTokens).reduce((a, b) => a + b, 0);
    let availableTokens = 0;
    for (const list of pool.candidates.values()) for (const r of list) availableTokens += r.tokenCount;
    return {
      issues: pool.issues,
      issueExamples: pool.issueExamples,
      review: pool.review,
      sourceRows: pool.sourceRows,
      stratumCounts: pool.stratumCounts,
      stratumTokens: pool.stratumTokens,
      totalRows: pool.totalRows,
      usableRows: Object.values(pool.sourceRows).reduce((a, b) => a + b, 0),
      usableTokens,
      availableTokens,
      tokenizer: tokenizer.kind,
      strata: pool.candidates.size,
    };
  },

  async select(input: SelectInput, report: Report): Promise<SelectOutput> {
    if (!pool || !analyzeInput) throw new Error("Analyze the data first.");
    const started = performance.now();
    const cfg = {
      targetTokens: input.targetTokens,
      seed: input.seed,
      poolSeed: analyzeInput.poolSeed,
      qualityFloor: input.qualityFloor,
      candidateCapPerStratum: analyzeInput.candidateCap,
      maxLength: analyzeInput.maxLength,
      exactFit: input.exactFit,
    };
    const results: SelectOutput["results"] = {};
    const skipped: SelectOutput["skipped"] = {};
    let step = 0;
    const total = input.policies.length;

    for (const policy of input.policies) {
      report({ stage: policy === "diversity" ? "comparing" : "picking", done: step, total });
      let order: OrderFn;
      let clusterInfo: { covered: (rows: PoolRecord[]) => number } | undefined;
      if (policy === "random") order = (r, s) => randomOrder(r, s);
      else if (policy === "quality") order = (r, _s, f) => qualityOrder(r, f);
      else {
        try {
          const all = [...pool.candidates.values()].flat().filter((r) => r.qualityScore >= input.qualityFloor);
          let embedder;
          if (input.embedder === "mock") embedder = hashEmbedder();
          else {
            report({ stage: "downloading", done: 0, total: 100, note: "embedder" });
            embedderCache ??= await loadMiniLM({ onProgress: (p) => report({ stage: "downloading", done: p, total: 100, note: "embedder" }) });
            embedder = embedderCache;
          }
          const deps = await makeDiversityDeps(
            all.map((r) => r.text),
            embedder,
            (done, tot) => report({ stage: "comparing", done, total: tot, note: "embedding" }),
          );
          const labelsByStratum = new Map<string, Map<string, number>>();
          order = (recs, seed, floor) => {
            const filtered = recs.filter((r) => r.qualityScore >= floor);
            if (filtered.length > 2) {
              const labels = deps.cluster(deps.embed(filtered.map((r) => r.text)), clusterCount(filtered.length), seed);
              const key = recs[0] ? `${recs[0].source}|${recs[0].lengthBin}` : "";
              labelsByStratum.set(key, new Map(filtered.map((r, i) => [r.exampleId, labels[i]!])));
            }
            return diversityOrder(recs, floor, seed, deps);
          };
          clusterInfo = {

            covered: (rows) => {
              const seen = new Set<string>();
              for (const r of rows) {
                const l = labelsByStratum.get(`${r.source}|${r.lengthBin}`)?.get(r.exampleId);
                if (l !== undefined) seen.add(`${r.source}|${r.lengthBin}|${l}`);
              }
              return seen.size;
            },
          };
        } catch (e) {
          skipped[policy] = e instanceof Error ? e.message : "The comparison model could not be loaded.";
          step++;
          continue;
        }
      }
      const res = selectPolicy(pool, policy, cfg, { order });
      const out: PolicyOutput = { ...res, fillerIds: [...res.fillerIds] };
      if (policy === "diversity" && clusterInfo) {
        let totalClusters = 0;
        for (const list of pool.candidates.values()) {
          const f = list.filter((r) => r.qualityScore >= input.qualityFloor).length;
          totalClusters += f > 2 ? clusterCount(f) : f;
        }
        out.topicsTotal = totalClusters;
        out.topicsCovered = clusterInfo.covered(res.selected);
      }
      results[policy] = out;
      step++;
    }
    report({ stage: "comparing", done: total, total });
    const universe = [...pool.candidates.keys()].sort(cmpStr).flatMap((k) => pool!.candidates.get(k)!);
    const bins = Math.min(360, universe.length);
    const binOf = (i: number) => Math.min(bins - 1, Math.floor((i * bins) / universe.length));
    const map: SelectionMap = { total: new Array(bins).fill(0), picked: {} };
    universe.forEach((_, i) => map.total[binOf(i)]!++);
    for (const [policy, out] of Object.entries(results) as [PolicyId, PolicyOutput][]) {
      const ids = new Set(out.selected.map((r) => r.exampleId));
      const counts = new Array(bins).fill(0);
      universe.forEach((r, i) => ids.has(r.exampleId) && counts[binOf(i)]++);
      map.picked[policy] = counts;
    }
    return { map, results, skipped, elapsedMs: Math.round(performance.now() - started) };
  },
};

export type PipelineApi = typeof api;
Comlink.expose(api);
