export type Role = "system" | "user" | "assistant";
export interface Message {
  role: Role;
  content: string;
}

export type PolicyId = "random" | "quality" | "diversity";

/** One input row before any checking. */
export interface RawRow {
  source: string;
  messages: unknown;
}

export interface PoolRecord {
  exampleId: string;
  source: string;
  sourceRow: number;
  lengthBin: string;
  tokenCount: number;
  qualityScore: number;
  /** contents joined by "\n" (what the embedder sees) */
  text: string;
  messages: Message[];
}

export type IssueKind =
  | "malformed"
  | "tooLong"
  | "empty"
  | "tooFewWords"
  | "notEnglish"
  | "repeatedChars"
  | "duplicate";

export type IssueCounts = Record<IssueKind, number>;

export interface Pool {
  /** stratum -> candidates after the per-stratum cap, sorted by (sourceRow, exampleId) */
  candidates: Map<string, PoolRecord[]>;
  /** counts before the cap */
  stratumCounts: Record<string, number>;
  /** tokens before the cap (quota basis) */
  stratumTokens: Record<string, number>;
  sourceRows: Record<string, number>;
  issues: IssueCounts;
  /** up to 3 short previews per issue kind */
  issueExamples: Record<IssueKind, IssueExample[]>;
  /** usable rows worth a second look (app heuristic, not used for selection) */
  review: { shortAnswer: number; repeatedChars: number };
  totalRows: number;
}

export interface IssueExample {
  source: string;
  row: number;
  preview: string;
}

export interface SelectConfig {
  targetTokens: number;
  seed: number;
  poolSeed: number;
  qualityFloor: number;
  candidateCapPerStratum: number;
  maxLength: number;
  exactFit: boolean;
}

export const PAPER_DEFAULTS: SelectConfig = {
  targetTokens: 100_000,
  seed: 13,
  poolSeed: 0,
  qualityFloor: 0.55,
  candidateCapPerStratum: 250,
  maxLength: 2048,
  exactFit: true,
};

export interface PolicyResult {
  policy: PolicyId;
  selected: PoolRecord[];
  usedTokens: number;
  budgetError: number;
  exact: boolean;
  fillerIds: Set<string>;
  byStratum: Record<string, { rows: number; tokens: number }>;
  /** tokens taken per stratum by the quota pass (before top-up / exact fit) */
  quotaTokens: Record<string, number>;
  quotas: Record<string, number>;
  diversity?: { clusters: number; clustersCovered: number };
}

/** Order provider so diversity can be injected (worker uses real embeddings). */
export type OrderFn = (records: PoolRecord[], seed: number, floor: number) => PoolRecord[];
