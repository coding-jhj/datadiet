import type { IssueCounts, IssueExample, IssueKind, PolicyId, PolicyResult, PoolRecord, RawRow } from "@/engine/types";

export type Stage = "reading" | "counting" | "checking" | "picking" | "comparing" | "downloading";

export interface ProgressEvent {
  stage: Stage;
  done: number;
  total: number;
  note?: string;
}

export interface AnalyzeInput {
  rows: RawRow[];
  candidateCap: number;
  maxLength: number;
  poolSeed: number;
  whitespace: "keep" | "collapse";
  /** try the real Qwen tokenizer first (falls back to an estimate) */
  realTokenizer: boolean;
}

export interface PoolSummary {
  issues: IssueCounts;
  issueExamples: Record<IssueKind, IssueExample[]>;
  review: { shortAnswer: number; repeatedChars: number };
  sourceRows: Record<string, number>;
  stratumCounts: Record<string, number>;
  stratumTokens: Record<string, number>;
  totalRows: number;
  usableRows: number;
  /** tokens of all usable rows (before the per-stratum cap) */
  usableTokens: number;
  /** tokens available to the picker (after the cap) */
  availableTokens: number;
  tokenizer: "qwen-real" | "estimate";
  strata: number;
}

export interface SelectInput {
  targetTokens: number;
  seed: number;
  qualityFloor: number;
  exactFit: boolean;
  policies: PolicyId[];
  /** "real" downloads MiniLM; "mock" is for automated tests only */
  embedder: "real" | "mock";
}

export interface PolicyOutput extends Omit<PolicyResult, "fillerIds" | "selected"> {
  selected: PoolRecord[];
  fillerIds: string[];
  /** number of distinct topic groups the picked rows come from (varied policy only) */
  topicsCovered?: number;
  topicsTotal?: number;
}

export interface SelectionMap {
  /** candidates in reading order, grouped into bins */
  total: number[];
  picked: Partial<Record<PolicyId, number[]>>;
}

export interface SelectOutput {
  map: SelectionMap;
  results: Partial<Record<PolicyId, PolicyOutput>>;
  skipped: Partial<Record<PolicyId, string>>;
  elapsedMs: number;
}
