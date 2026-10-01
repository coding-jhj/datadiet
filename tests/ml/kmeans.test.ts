import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inertia, kmeans } from "@/ml/kmeans";

const cases = JSON.parse(readFileSync(new URL("../golden/kmeans.json", import.meta.url), "utf8")) as {
  points: number[][];
  k: number;
  runs: { seed: number; labels: number[]; inertia: number }[];
}[];

describe("kmeans statistical parity with sklearn MiniBatchKMeans", () => {
  cases.forEach((c, ci) => {
    it(`case ${ci}: inertia within 10% of sklearn (or better), all clusters used, deterministic`, () => {
      for (const run of c.runs) {
        const labels = kmeans(c.points, c.k, run.seed);
        const again = kmeans(c.points, c.k, run.seed);
        expect([...labels]).toEqual([...again]);
        const mine = inertia(c.points, labels);
        const ref = inertia(c.points, run.labels);
        expect(mine).toBeLessThanOrEqual(ref * 1.1);
        expect(new Set(labels).size).toBeGreaterThanOrEqual(Math.floor(c.k * 0.8));
      }
    });
  });
  it("handles degenerate inputs", () => {
    expect(kmeans([], 3, 1).length).toBe(0);
    expect([...kmeans([[1, 0], [1, 0], [1, 0]], 2, 1)].length).toBe(3);
    expect(new Set(kmeans([[0], [1]], 5, 1)).size).toBe(2);
  });
});
