import { describe, expect, it } from "vitest";
import { diversityOrder } from "@/engine/orders";
import { buildPool } from "@/engine/pool";
import { selectPolicy } from "@/engine/select";
import type { PoolRecord, RawRow, SelectConfig } from "@/engine/types";
import { hashEmbedder, makeDiversityDeps } from "@/ml/embedder";
import { estimateProvider } from "@/ml/tokenizer";

const rows: RawRow[] = Array.from({ length: 200 }, (_, i) => ({
  source: "demo",
  messages: [
    { role: "user", content: `please explain topic number ${i % 17} with the details of case ${i} in a clear way` },
    { role: "assistant", content: `Here is how to think about topic ${i % 17} and case ${i}. ` + "The answer is that the data and the model matter for the result. ".repeat(3 + (i % 5)) },
  ],
}));

describe("diversity end-to-end with mock embedder", () => {
  it("runs, fits the budget exactly, covers clusters, is deterministic", async () => {
    const pool = buildPool(rows, (b) => estimateProvider.count(b), { poolSeed: 0, candidateCapPerStratum: 250, maxLength: 2048 });
    const all: PoolRecord[] = [...pool.candidates.values()].flat();
    const deps = await makeDiversityDeps(all.map((r) => r.text), hashEmbedder());
    const cfg: SelectConfig = { targetTokens: 4000, seed: 13, poolSeed: 0, qualityFloor: 0.55, candidateCapPerStratum: 250, maxLength: 2048, exactFit: true };
    const run = () => selectPolicy(pool, "diversity", cfg, { order: (r, s, f) => diversityOrder(r, f, s, deps) });
    const a = run();
    expect(a.exact).toBe(true);
    expect(a.usedTokens).toBe(4000);
    expect(run().selected.map((r) => r.exampleId)).toEqual(a.selected.map((r) => r.exampleId));
  });
  it("throws a clear error when a text was not pre-embedded", async () => {
    const deps = await makeDiversityDeps(["a"], hashEmbedder());
    expect(() => deps.embed(["zzz"])).toThrow(/pre-embedded/);
  });
});
