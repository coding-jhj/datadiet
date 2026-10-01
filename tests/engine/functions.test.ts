import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fitExactBudget, findSubsetSum, takeUnderBudget } from "@/engine/budget";
import { canonicalMessages, exampleId } from "@/engine/normalize";
import { diversityOrder, qualityOrder, randomOrder } from "@/engine/orders";
import { tokenQuotas } from "@/engine/quota";
import { MT19937 } from "@/engine/rng";
import { hardValid, lengthBin, textQuality } from "@/engine/score";
import { stableInt } from "@/engine/hash";
import type { PoolRecord } from "@/engine/types";
import { stubDeps, stubTokenCount } from "../support/stubs";

const load = (name: string) => JSON.parse(readFileSync(new URL(`../golden/${name}.json`, import.meta.url), "utf8"));
const fn = load("functions");
const shuffle = load("shuffle");
const rows = load("rows") as Record<string, { messages: unknown }[]>;

const rec = (id: string, tokens: number, quality = 0, text = ""): PoolRecord => ({
  exampleId: id,
  source: "s",
  sourceRow: 0,
  lengthBin: "0-255",
  tokenCount: tokens,
  qualityScore: quality,
  text,
  messages: [],
});

describe("normalize", () => {
  it("canonical_messages on malformed and odd inputs", () => {
    for (const c of fn.canonical_raw) expect(canonicalMessages(c.raw)).toEqual(c.canonical);
  });
  it("edge rows: canonical, id, tokens, valid, quality (exact ==)", () => {
    for (const e of fn.edge) {
      const canon = canonicalMessages(e.raw)!;
      expect(canon).toEqual(e.canonical);
      expect(exampleId(canon)).toBe(e.id);
      const t = stubTokenCount(canon);
      expect(t).toBe(e.tokens);
      expect(hardValid(canon, t, 2048)).toBe(e.valid);
      expect(textQuality(canon, t)).toBe(e.quality);
      expect(textQuality(canon, 10)).toBe(e.quality_short_len);
      expect(textQuality(canon, 1600)).toBe(e.quality_long_len);
    }
  });
  it("all 1800 synthetic rows", () => {
    let i = 0;
    for (const source of Object.keys(rows)) {
      rows[source]!.forEach((row, index) => {
        const g = fn.per_row[i++];
        expect([g.source, g.row]).toEqual([source, index]);
        const canon = canonicalMessages(row.messages);
        expect(canon).toEqual(g.canonical);
        if (!canon) return;
        const t = stubTokenCount(canon);
        expect(exampleId(canon)).toBe(g.id);
        expect(t).toBe(g.tokens);
        expect(hardValid(canon, t, 2048)).toBe(g.valid);
        expect(textQuality(canon, t)).toBe(g.quality);
        if (g.bin !== null) expect(lengthBin(t)).toBe(g.bin);
      });
    }
    expect(i).toBe(fn.per_row.length);
  });
});

describe("primitives", () => {
  it("length_bin boundaries", () => {
    for (const c of fn.length_bin) expect(lengthBin(c.tokens)).toBe(c.bin);
    expect(() => lengthBin(2049)).toThrow();
  });
  it("stable_int (64-bit)", () => {
    for (const c of fn.stable_int) expect(stableInt(c.value).toString()).toBe(c.int);
  });
  it("MT19937 shuffle equals CPython for big seeds", () => {
    for (const c of shuffle.cases) {
      const list = Array.from({ length: c.n }, (_, i) => i);
      new MT19937(BigInt(c.seed)).shuffle(list);
      expect(list, `seed ${c.seed} n ${c.n}`).toEqual(c.order);
    }
  });
});

describe("quota and orders", () => {
  it("token_quotas", () => {
    for (const c of fn.token_quotas) expect(tokenQuotas(c.stratum_tokens, c.target)).toEqual(c.quotas);
  });
  it("random_order", () => {
    for (const c of fn.random_order) {
      expect(randomOrder(c.ids.map((id: string) => rec(id, 10)), c.seed).map((r) => r.exampleId)).toEqual(c.order);
    }
  });
  it("quality_order", () => {
    for (const c of fn.quality_order) {
      const recs = c.items.map((x: { id: string; quality: number }) => rec(x.id, 10, x.quality));
      expect(qualityOrder(recs as PoolRecord[], c.floor).map((r) => r.exampleId)).toEqual(c.order);
    }
  });
  it("diversity_order with stub embedder and stub clusterer", () => {
    for (const c of fn.diversity_order) {
      const recs = c.items.map((x: { id: string; quality: number; text: string }) => rec(x.id, 10, x.quality, x.text));
      expect(diversityOrder(recs, c.floor, c.seed, stubDeps).map((r) => r.exampleId)).toEqual(c.order);
    }
  });
});

describe("budget", () => {
  const mk = (items: { id: string; tokens: number }[]) => items.map((x) => rec(x.id, x.tokens));
  it("take_under_budget", () => {
    for (const c of fn.take_under_budget) {
      const out = takeUnderBudget(mk(c.items), c.budget);
      expect(out.chosen.map((r) => r.exampleId)).toEqual(c.chosen);
      expect(out.total).toBe(c.total);
    }
  });
  it("find_subset_sum returns the same subset in the same order", () => {
    for (const c of fn.find_subset_sum) {
      const out = findSubsetSum(mk(c.items), c.target);
      expect(out === null ? null : out.map((r) => r.exampleId)).toEqual(c.result);
    }
  });
  it("fit_exact_budget", () => {
    for (const c of fn.fit_exact_budget) {
      const recs = mk(c.items);
      const byId = new Map(recs.map((r) => [r.exampleId, r]));
      const out = fitExactBudget(c.selected.map((id: string) => byId.get(id)!), recs, c.target);
      expect(out.map((r) => r.exampleId)).toEqual(c.result);
    }
  });
});
