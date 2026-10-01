import { cachedStableInt, cmpBig } from "./budget";
import { MT19937 } from "./rng";
import { cmpStr } from "./text";
import type { PoolRecord } from "./types";

export function randomOrder<T extends { exampleId: string }>(records: T[], seed: number | bigint): T[] {
  const ordered = [...records].sort((a, b) => cmpStr(a.exampleId, b.exampleId));
  new MT19937(seed).shuffle(ordered);
  return ordered;
}

export function qualityOrder<T extends { exampleId: string; qualityScore: number }>(records: T[], floor: number): T[] {
  return records
    .filter((r) => r.qualityScore >= floor)
    .sort((a, b) => b.qualityScore - a.qualityScore || cmpBig(cachedStableInt(a.exampleId), cachedStableInt(b.exampleId)) || cmpStr(a.exampleId, b.exampleId));
}

export interface DiversityDeps {
  /** L2-normalised embeddings, one row per text */
  embed(texts: string[]): number[][] | Float32Array[];
  /** cluster labels (integers) for k clusters */
  cluster(embeddings: ArrayLike<number>[], k: number, seed: number): ArrayLike<number>;
}

export function clusterCount(n: number): number {
  return Math.min(n, Math.max(2, Math.round(Math.sqrt(n))));
}

/** Port of diversity_order with injectable embedder and clusterer. */
export function diversityOrder(records: PoolRecord[], floor: number, seed: number, deps: DiversityDeps): PoolRecord[] {
  const filtered = records.filter((r) => r.qualityScore >= floor);
  if (filtered.length <= 2) return filtered;
  const embeddings = deps.embed(filtered.map((r) => r.text));
  const labels = deps.cluster(embeddings, clusterCount(filtered.length), seed);
  return roundRobin(filtered, labels, seed);
}

export function roundRobin<T extends { exampleId: string; qualityScore: number }>(filtered: T[], labels: ArrayLike<number>, seed: number): T[] {
  const clusters = new Map<number, T[]>();
  filtered.forEach((r, i) => {
    const label = labels[i]!;
    const list = clusters.get(label);
    if (list) list.push(r);
    else clusters.set(label, [r]);
  });
  for (const list of clusters.values()) {
    list.sort((a, b) => b.qualityScore - a.qualityScore || cmpBig(cachedStableInt(`${seed}:${a.exampleId}`), cachedStableInt(`${seed}:${b.exampleId}`)));
  }
  const ids = [...clusters.keys()].sort((a, b) => a - b);
  const heads = new Map<number, number>(ids.map((id) => [id, 0]));
  const ordered: T[] = [];
  for (;;) {
    let added = false;
    for (const id of ids) {
      const list = clusters.get(id)!;
      const at = heads.get(id)!;
      if (at < list.length) {
        ordered.push(list[at]!);
        heads.set(id, at + 1);
        added = true;
      }
    }
    if (!added) return ordered;
  }
}
