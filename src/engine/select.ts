import { fitExactBudget, takeUnderBudget } from "./budget";
import { tokenQuotas } from "./quota";
import { cmpStr } from "./text";
import type { OrderFn, Pool, PolicyId, PolicyResult, PoolRecord, SelectConfig } from "./types";

export interface SelectOptions {
  order: OrderFn;
  shouldCancel?: () => boolean;
}

/** Port of the per-strategy loop in select_data.main (code behaviour, see D5). */
export function selectPolicy(pool: Pool, policy: PolicyId, cfg: SelectConfig, opts: SelectOptions): PolicyResult {
  const quotas = tokenQuotas(pool.stratumTokens, cfg.targetTokens);
  const strata = [...pool.candidates.keys()].sort(cmpStr);
  let selected: PoolRecord[] = [];
  const orders = new Map<string, PoolRecord[]>();
  const quotaTokens: Record<string, number> = {};
  for (const stratum of strata) {
    if (opts.shouldCancel?.()) throw new Error("cancelled");
    const ordered = opts.order(pool.candidates.get(stratum)!, cfg.seed, cfg.qualityFloor);
    orders.set(stratum, ordered);
    const { chosen, total } = takeUnderBudget(ordered, quotas[stratum] ?? 0);
    quotaTokens[stratum] = total;
    selected.push(...chosen);
  }
  let actual = selected.reduce((a, r) => a + r.tokenCount, 0);
  if (actual < cfg.targetTokens) {
    const ids = new Set(selected.map((r) => r.exampleId));
    const remaining: PoolRecord[] = [];
    for (const stratum of strata) for (const r of orders.get(stratum)!) if (!ids.has(r.exampleId)) remaining.push(r);
    selected.push(...takeUnderBudget(remaining, cfg.targetTokens - actual).chosen);
  }
  const preFit = new Set(selected.map((r) => r.exampleId));
  if (cfg.exactFit) {
    const all: PoolRecord[] = [];
    for (const list of pool.candidates.values()) all.push(...list);
    selected = fitExactBudget(selected, all, cfg.targetTokens, opts.shouldCancel);
  }
  selected = [...selected].sort((a, b) => cmpStr(a.source, b.source) || a.sourceRow - b.sourceRow || cmpStr(a.exampleId, b.exampleId));
  const fillerIds = new Set(selected.filter((r) => !preFit.has(r.exampleId)).map((r) => r.exampleId));
  const usedTokens = selected.reduce((a, r) => a + r.tokenCount, 0);
  const byStratum: Record<string, { rows: number; tokens: number }> = {};
  for (const r of selected) {
    const key = `${r.source}|${r.lengthBin}`;
    const cell = (byStratum[key] ??= { rows: 0, tokens: 0 });
    cell.rows++;
    cell.tokens += r.tokenCount;
  }
  return {
    policy,
    selected,
    usedTokens,
    budgetError: cfg.targetTokens - usedTokens,
    exact: usedTokens === cfg.targetTokens,
    fillerIds,
    byStratum,
    quotaTokens,
    quotas,
  };
}
