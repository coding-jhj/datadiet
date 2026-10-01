import type { Pool, PolicyResult, PoolRecord, SelectConfig } from "./types";

export function trainingJsonl(selected: PoolRecord[]): string {
  return selected.map((r) => JSON.stringify({ messages: r.messages })).join("\n") + (selected.length ? "\n" : "");
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same columns as the study's manifests. */
export function manifestCsv(selected: PoolRecord[]): string {
  const head = "example_id,source,source_row,length_bin,token_count,quality_score";
  const lines = selected.map((r) => [r.exampleId, r.source, r.sourceRow, r.lengthBin, r.tokenCount, r.qualityScore].map(csvCell).join(","));
  return [head, ...lines].join("\n") + "\n";
}

export interface SummaryMeta {
  tokenCounter: "qwen-real" | "estimate";
  whitespace: "keep" | "collapse";
  appVersion: string;
}

/** Field names follow the study's summary JSON, plus a few app-only fields. */
export function summaryJson(res: PolicyResult, cfg: SelectConfig, pool: Pick<Pool, "sourceRows" | "stratumCounts" | "stratumTokens">, meta: SummaryMeta): string {
  const bySource: Record<string, number> = {};
  for (const r of res.selected) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  const rowsByStratum: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.byStratum)) rowsByStratum[k] = v.rows;
  return JSON.stringify(
    {
      strategy: res.policy,
      seed: cfg.seed,
      pool_seed: cfg.poolSeed,
      max_length: cfg.maxLength,
      quality_floor: cfg.qualityFloor,
      target_tokens: cfg.targetTokens,
      actual_tokens: res.usedTokens,
      budget_error: res.budgetError,
      exact_budget: res.exact,
      candidate_cap_per_stratum: cfg.candidateCapPerStratum,
      candidate_pool_rows_by_source: pool.sourceRows,
      candidate_pool_rows_by_stratum: pool.stratumCounts,
      candidate_pool_tokens_by_stratum: pool.stratumTokens,
      selected_rows_by_source: bySource,
      selected_rows_by_stratum: rowsByStratum,
      selected_tokens_by_stratum: res.quotaTokens,
      filler_ids: [...res.fillerIds],
      token_counter: meta.tokenCounter,
      whitespace: meta.whitespace,
      app_version: meta.appVersion,
    },
    null,
    2,
  );
}
