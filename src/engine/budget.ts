import { stableInt } from "./hash";
import { cmpStr } from "./text";
import type { PoolRecord } from "./types";

type Rec = Pick<PoolRecord, "exampleId" | "tokenCount">;

const siCache = new Map<string, bigint>();
export function cachedStableInt(value: string): bigint {
  let v = siCache.get(value);
  if (v === undefined) {
    v = stableInt(value);
    if (siCache.size > 500_000) siCache.clear();
    siCache.set(value, v);
  }
  return v;
}

export function cmpBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Port of take_under_budget. */
export function takeUnderBudget<T extends Rec>(ordered: Iterable<T>, budget: number): { chosen: T[]; total: number } {
  const list = [...ordered];
  const chosen: T[] = [];
  const chosenIds = new Set<string>();
  let total = 0;
  for (const r of list) {
    if (total + r.tokenCount <= budget) {
      chosen.push(r);
      chosenIds.add(r.exampleId);
      total += r.tokenCount;
    }
    if (total === budget) break;
  }
  if (total < budget) {
    const remaining = list
      .filter((r) => !chosenIds.has(r.exampleId))
      .sort((a, b) => a.tokenCount - b.tokenCount || cmpBig(cachedStableInt(a.exampleId), cachedStableInt(b.exampleId)) || cmpStr(a.exampleId, b.exampleId));
    for (const r of remaining) {
      if (total + r.tokenCount <= budget) {
        chosen.push(r);
        total += r.tokenCount;
      }
      if (total === budget) break;
    }
  }
  return { chosen, total };
}

export const SUBSET_STATE_LIMIT = 100_000;

/** Port of find_subset_sum: same search order, same result. */
export function findSubsetSum<T extends Rec>(records: T[], target: number, shouldCancel?: () => boolean): T[] | null {
  if (target === 0) return [];
  const candidates = records
    .filter((r) => r.tokenCount > 0 && r.tokenCount <= target)
    .sort((a, b) => a.tokenCount - b.tokenCount || cmpStr(a.exampleId, b.exampleId));
  // subtotal -> [parent subtotal, candidate index]
  const states = new Map<number, [number, number]>([[0, [-1, -1]]]);
  const path = (end: number): T[] => {
    const idx: number[] = [];
    let cur = end;
    while (cur !== 0) {
      const [parent, i] = states.get(cur)!;
      idx.push(i);
      cur = parent;
    }
    return idx.reverse().map((i) => candidates[i]!);
  };
  for (let index = 0; index < candidates.length; index++) {
    if (shouldCancel?.()) throw new Error("cancelled");
    const rec = candidates[index]!;
    const additions = new Map<number, [number, number]>();
    for (const subtotal of [...states.keys()]) {
      const newTotal = subtotal + rec.tokenCount;
      if (newTotal > target || states.has(newTotal) || additions.has(newTotal)) continue;
      additions.set(newTotal, [subtotal, index]);
      if (newTotal === target) {
        for (const [k, v] of additions) states.set(k, v);
        return path(target);
      }
    }
    for (const [k, v] of additions) states.set(k, v);
    if (states.size > SUBSET_STATE_LIMIT) break;
  }
  return null;
}

/** Port of fit_exact_budget. */
export function fitExactBudget<T extends Rec>(selected: T[], candidates: T[], target: number, shouldCancel?: () => boolean): T[] {
  let current = 0;
  for (const r of selected) current += r.tokenCount;
  if (current === target) return selected;
  if (current > target) return selected;
  const selectedIds = new Set(selected.map((r) => r.exampleId));
  const remaining = candidates.filter((r) => !selectedIds.has(r.exampleId));
  const residual = target - current;
  const direct = findSubsetSum(remaining, residual, shouldCancel);
  if (direct !== null) return [...selected, ...direct];

  const smallestSelected = [...selected].sort((a, b) => a.tokenCount - b.tokenCount || cmpStr(a.exampleId, b.exampleId)).slice(0, 24);
  for (const removed of smallestSelected) {
    const replacement = findSubsetSum(remaining, residual + removed.tokenCount, shouldCancel);
    if (replacement !== null) return [...selected.filter((r) => r.exampleId !== removed.exampleId), ...replacement];
  }

  const pair = smallestSelected.slice(0, 12);
  for (let li = 0; li < pair.length; li++) {
    for (const right of pair.slice(li + 1)) {
      const left = pair[li]!;
      const replacement = findSubsetSum(remaining, residual + left.tokenCount + right.tokenCount, shouldCancel);
      if (replacement !== null) {
        return [...selected.filter((r) => r.exampleId !== left.exampleId && r.exampleId !== right.exampleId), ...replacement];
      }
    }
  }
  return selected;
}
