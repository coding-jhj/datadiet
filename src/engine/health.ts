import type { IssueExample, Pool } from "./types";
import type { ParseResult } from "@/io/parse";

export type SkipCode = "unreadable" | "missingRoles" | "tooLong" | "notEnglish" | "garbled" | "duplicate";
export type ReviewCode = "shortAnswer" | "repeatedChars";

export interface HealthItem {
  code: SkipCode;
  count: number;
  examples: (IssueExample | { line: number; preview: string })[];
}

export interface HealthSummary {
  total: number;
  usable: number;
  skipped: HealthItem[];
  review: { code: ReviewCode; count: number }[];
  /** show the "English data only" banner */
  englishOnly: boolean;
  skippedRatio: number;
}

export function buildHealth(parse: ParseResult, pool: Pick<Pool, "issues" | "issueExamples" | "review" | "sourceRows">): HealthSummary {
  const i = pool.issues;
  const ex = pool.issueExamples;
  const usable = Object.values(pool.sourceRows).reduce((a, b) => a + b, 0);
  const total = parse.rows.length + parse.unreadable.length;
  const items: HealthItem[] = [
    { code: "unreadable", count: parse.unreadable.length, examples: parse.unreadable.slice(0, 3).map((u) => ({ line: u.line, preview: u.reason })) },
    { code: "missingRoles", count: i.malformed + i.empty, examples: [...ex.malformed, ...ex.empty].slice(0, 3) },
    { code: "tooLong", count: i.tooLong, examples: ex.tooLong },
    { code: "notEnglish", count: i.tooFewWords + i.notEnglish, examples: [...ex.tooFewWords, ...ex.notEnglish].slice(0, 3) },
    { code: "garbled", count: i.repeatedChars, examples: ex.repeatedChars },
    { code: "duplicate", count: i.duplicate, examples: ex.duplicate },
  ];
  const skipped = items.filter((x) => x.count > 0);
  const skippedTotal = skipped.reduce((a, x) => a + x.count, 0);
  const notEnglish = items.find((x) => x.code === "notEnglish")!.count;
  const skippedRatio = total ? skippedTotal / total : 0;
  return {
    total,
    usable,
    skipped,
    review: [
      { code: "shortAnswer" as const, count: pool.review.shortAnswer },
      { code: "repeatedChars" as const, count: pool.review.repeatedChars },
    ].filter((x) => x.count > 0),
    englishOnly: skippedRatio > 0.5 || (skippedTotal > 0 && notEnglish > skippedTotal / 2),
    skippedRatio,
  };
}
