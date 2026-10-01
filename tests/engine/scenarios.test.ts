import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diversityOrder, qualityOrder, randomOrder } from "@/engine/orders";
import { buildPool } from "@/engine/pool";
import { selectPolicy } from "@/engine/select";
import type { OrderFn, PolicyId, RawRow, SelectConfig } from "@/engine/types";
import { stubDeps, stubTokenCount } from "../support/stubs";

const load = (name: string) => JSON.parse(readFileSync(new URL(`../golden/${name}.json`, import.meta.url), "utf8"));
const rows = load("rows") as Record<string, { messages: unknown }[]>;
const scenarios = load("scenarios") as any[];
const poolSnapshots = scenarios[0].pools as Record<string, any>;

const rawRows = (): RawRow[] => Object.entries(rows).flatMap(([source, list]) => list.map((r) => ({ source, messages: r.messages })));
const counter = (batch: { role: string; content: string }[][]) => batch.map((m) => stubTokenCount(m as any));

const poolFor = (cap: number, poolSeed: number) =>
  buildPool(rawRows(), counter as any, { poolSeed, candidateCapPerStratum: cap, maxLength: 2048 });

const orderFor = (policy: PolicyId): OrderFn =>
  policy === "random"
    ? (recs, seed) => randomOrder(recs, seed)
    : policy === "quality"
      ? (recs, _seed, floor) => qualityOrder(recs, floor)
      : (recs, seed, floor) => diversityOrder(recs, floor, seed, stubDeps);

describe("pool (load_pool parity)", () => {
  for (const [key, snap] of Object.entries(poolSnapshots)) {
    it(`pool ${key}`, () => {
      const m = /cap(\d+)-ps(\d+)/.exec(key)!;
      const pool = poolFor(Number(m[1]), Number(m[2]));
      expect(pool.stratumCounts).toEqual(snap.stratum_counts);
      expect(pool.stratumTokens).toEqual(snap.stratum_tokens);
      expect(pool.sourceRows).toEqual(snap.source_rows);
      const got: Record<string, unknown[]> = {};
      for (const [s, list] of pool.candidates) got[s] = list.map((r) => [r.source, r.sourceRow, r.exampleId, r.tokenCount, r.qualityScore]);
      expect(got).toEqual(snap.candidates);
    });
  }
});

describe("end-to-end scenarios vs unmodified select_data.main()", () => {
  for (const sc of scenarios.slice(1)) {
    const pool = poolFor(sc.config.cap, sc.config.poolSeed);
    for (const seed of sc.config.seeds as number[]) {
      for (const policy of ["random", "quality", "diversity"] as PolicyId[]) {
        it(`${sc.name} ${policy}-${seed}`, () => {
          const golden = sc.runs[`${policy}-${seed}`];
          const cfg: SelectConfig = {
            targetTokens: sc.config.target,
            seed,
            poolSeed: sc.config.poolSeed,
            qualityFloor: sc.config.floor,
            candidateCapPerStratum: sc.config.cap,
            maxLength: 2048,
            exactFit: true,
          };
          const res = selectPolicy(pool, policy, cfg, { order: orderFor(policy) });
          const picked = res.selected.map((r) => `${r.source}|${r.sourceRow}|${r.tokenCount}|${r.exampleId.slice(0, 10)}`);
          expect(picked).toEqual(golden.picked);
          const s = golden.summary;
          expect(res.usedTokens).toBe(s.actual_tokens);
          expect(res.exact).toBe(s.exact_budget);
          expect(res.budgetError).toBe(s.budget_error);
          const bySource: Record<string, number> = {};
          for (const r of res.selected) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
          expect(bySource).toEqual(s.selected_rows_by_source);
          const rowsByStratum: Record<string, number> = {};
          for (const [k, v] of Object.entries(res.byStratum)) rowsByStratum[k] = v.rows;
          expect(rowsByStratum).toEqual(s.selected_rows_by_stratum);
          expect(res.quotaTokens).toEqual(s.selected_tokens_by_stratum);
        });
      }
    }
  }
});
