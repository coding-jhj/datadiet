import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { qualityOrder, randomOrder } from "@/engine/orders";
import { buildPool } from "@/engine/pool";
import { selectPolicy } from "@/engine/select";
import type { OrderFn, PolicyId, RawRow, SelectConfig } from "@/engine/types";
import { stubDeps, stubTokenCount } from "../support/stubs";
import { diversityOrder } from "@/engine/orders";

const WORDS = ["the", "a", "of", "to", "in", "with", "please", "how", "what", "data", "model", "train", "token", "budget", "select", "quality", "sample"];
const rowArb = fc
  .tuple(fc.constantFrom("a", "b"), fc.array(fc.constantFrom(...WORDS), { minLength: 8, maxLength: 120 }), fc.array(fc.constantFrom(...WORDS), { minLength: 30, maxLength: 200 }))
  .map(([source, q, a]): RawRow => ({ source, messages: [{ role: "user", content: q.join(" ") }, { role: "assistant", content: a.join(" ") }] }));

const counter = (b: any[][]) => b.map((m) => stubTokenCount(m));
const order = (p: PolicyId): OrderFn =>
  p === "random" ? (r, s) => randomOrder(r, s) : p === "quality" ? (r, _s, f) => qualityOrder(r, f) : (r, s, f) => diversityOrder(r, f, s, stubDeps);

describe("selection invariants", () => {
  it("never exceeds the budget, never repeats a row, is deterministic", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 5, maxLength: 80 }), fc.integer({ min: 50, max: 20000 }), fc.constantFrom<PolicyId>("random", "quality", "diversity"), fc.boolean(), (rows, target, policy, exactFit) => {
        const pool = buildPool(rows, counter, { poolSeed: 0, candidateCapPerStratum: 20, maxLength: 2048 });
        const cfg: SelectConfig = { targetTokens: target, seed: 13, poolSeed: 0, qualityFloor: 0.55, candidateCapPerStratum: 20, maxLength: 2048, exactFit };
        const a = selectPolicy(pool, policy, cfg, { order: order(policy) });
        const b = selectPolicy(pool, policy, cfg, { order: order(policy) });
        expect(a.selected.map((r) => r.exampleId)).toEqual(b.selected.map((r) => r.exampleId));
        const ids = a.selected.map((r) => r.exampleId);
        expect(new Set(ids).size).toBe(ids.length);
        if (a.exact || !exactFit) expect(a.usedTokens).toBeLessThanOrEqual(target);
        expect(a.usedTokens).toBe(a.selected.reduce((s, r) => s + r.tokenCount, 0));
        expect(a.budgetError).toBe(target - a.usedTokens);
      }),
      { numRuns: 60 },
    );
  });

  it("garbage input never throws", () => {
    const junk = fc.array(fc.record({ source: fc.constantFrom("x", "y"), messages: fc.anything() }), { maxLength: 30 });
    fc.assert(
      fc.property(junk, (rows) => {
        const pool = buildPool(rows as RawRow[], counter, { poolSeed: 0, candidateCapPerStratum: 5, maxLength: 2048 });
        expect(pool.totalRows).toBe(rows.length);
      }),
      { numRuns: 100 },
    );
  });
});

import { countNonSpace, asciiLetterCount, PY_WS } from "@/engine/text";
import { hasRepeatRun } from "@/engine/score";

describe("fast helpers equal their regex definitions", () => {
  const alphabet = ["a", "b", "z", "Z", " ", "\n", " ", "　", "﻿", "\u0085", "é", "😀", "😀", "1", "@", "["];
  const text = fc.array(fc.constantFrom(...alphabet), { maxLength: 60 }).map((a) => a.join(""));
  it("hasRepeatRun", () => {
    fc.assert(fc.property(text, fc.integer({ min: 2, max: 6 }), (t, run) => {
      const re = new RegExp(`([^\\n])\\1{${run - 1},}`, "u");
      expect(hasRepeatRun(t, run)).toBe(re.test(t));
    }), { numRuns: 500 });
  });
  it("countNonSpace / asciiLetterCount", () => {
    fc.assert(fc.property(text, (t) => {
      expect(countNonSpace(t)).toBe((t.match(new RegExp(`[^${PY_WS}]`, "gu")) ?? []).length);
      expect(asciiLetterCount(t)).toBe((t.match(/[A-Za-z]/g) ?? []).length);
    }), { numRuns: 500 });
  });
});
