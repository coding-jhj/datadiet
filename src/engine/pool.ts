import { canonicalMessages, exampleId, keepMessages } from "./normalize";
import { hardInvalidReason, hasRepeatRun, isBinnable, lengthBin, textQuality } from "./score";
import { stableInt } from "./hash";
import { wordTokenCount } from "./text";
import type { IssueCounts, IssueExample, IssueKind, Message, Pool, PoolRecord, RawRow } from "./types";

export type TokenCounter = (batch: Message[][]) => number[];

export interface PoolOptions {
  poolSeed: number;
  candidateCapPerStratum: number;
  maxLength: number;
  /** collapse = what the study did; keep = count and export the text as written */
  whitespace?: "keep" | "collapse";
  tokenizeBatchSize?: number;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export function emptyIssues(): IssueCounts {
  return { malformed: 0, tooLong: 0, empty: 0, tooFewWords: 0, notEnglish: 0, repeatedChars: 0, duplicate: 0 };
}

export function emptyExamples(): Record<IssueKind, IssueExample[]> {
  return { malformed: [], tooLong: [], empty: [], tooFewWords: [], notEnglish: [], repeatedChars: [], duplicate: [] };
}

function preview(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  text = text.replace(/\s+/g, " ");
  return text.length > 90 ? text.slice(0, 90) + "…" : text;
}

interface HeapItem {
  priority: bigint;
  rec: PoolRecord;
}

/** max-heap on priority: root is the worst (largest) kept candidate */
class MaxHeap {
  items: HeapItem[] = [];
  get size() {
    return this.items.length;
  }
  top(): HeapItem {
    return this.items[0]!;
  }
  push(item: HeapItem) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.priority >= a[i]!.priority) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  replaceTop(item: HeapItem) {
    const a = this.items;
    a[0] = item;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && a[l]!.priority > a[m]!.priority) m = l;
      if (r < a.length && a[r]!.priority > a[m]!.priority) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i]!, a[m]!];
      i = m;
    }
  }
}

/** Port of load_pool. Rows of a source are numbered in input order. */
export function buildPool(rows: Iterable<RawRow>, countTokens: TokenCounter, opts: PoolOptions): Pool {
  const batchSize = opts.tokenizeBatchSize ?? 128;
  const heaps = new Map<string, MaxHeap>();
  const stratumCounts: Record<string, number> = {};
  const stratumTokens: Record<string, number> = {};
  const sourceRows: Record<string, number> = {};
  const issues = emptyIssues();
  const issueExamples = emptyExamples();
  const review = { shortAnswer: 0, repeatedChars: 0 };
  const note = (kind: IssueKind, source: string, row: number, value: unknown) => {
    if (issueExamples[kind].length < 3) issueExamples[kind].push({ source, row, preview: preview(value) });
  };
  const seen = new Set<string>();
  const rowIndex = new Map<string, number>();
  const sourceOrder: string[] = [];
  let totalRows = 0;

  type Pending = { source: string; row: number; messages: Message[]; out: Message[] };
  const bySource = new Map<string, RawRow[]>();
  for (const r of rows) {
    let list = bySource.get(r.source);
    if (!list) {
      list = [];
      bySource.set(r.source, list);
      sourceOrder.push(r.source);
    }
    list.push(r);
  }
  const total = [...bySource.values()].reduce((a, l) => a + l.length, 0);
  let done = 0;

  const processBatch = (batch: Pending[]) => {
    if (!batch.length) return;
    const counts = countTokens(batch.map((b) => b.out));
    batch.forEach((item, i) => {
      const tokenCount = counts[i]!;
      const reason = hardInvalidReason(item.messages, tokenCount, opts.maxLength);
      if (reason) {
        issues[reason]++;
        note(reason, item.source, item.row, item.messages.map((m) => m.content).join(" / "));
        return;
      }
      if (!isBinnable(tokenCount)) {
        issues.tooLong++;
        note("tooLong", item.source, item.row, item.messages.map((m) => m.content).join(" / "));
        return;
      }
      const id = exampleId(item.messages);
      if (seen.has(id)) {
        issues.duplicate++;
        note("duplicate", item.source, item.row, item.messages.map((m) => m.content).join(" / "));
        return;
      }
      seen.add(id);
      const assistantWords = wordTokenCount(item.messages.filter((m) => m.role === "assistant").map((m) => m.content).join(" "));
      if (assistantWords < 8) review.shortAnswer++;
      if (hasRepeatRun(item.messages.map((m) => m.content).join(" "), 10)) review.repeatedChars++;
      sourceRows[item.source] = (sourceRows[item.source] ?? 0) + 1;
      const bin = lengthBin(tokenCount);
      const stratum = `${item.source}|${bin}`;
      stratumCounts[stratum] = (stratumCounts[stratum] ?? 0) + 1;
      stratumTokens[stratum] = (stratumTokens[stratum] ?? 0) + tokenCount;
      const rec: PoolRecord = {
        exampleId: id,
        source: item.source,
        sourceRow: item.row,
        lengthBin: bin,
        tokenCount,
        qualityScore: textQuality(item.messages, tokenCount),
        text: item.messages.map((m) => m.content).join("\n"),
        messages: item.out,
      };
      const priority = stableInt(`${opts.poolSeed}:${id}`);
      let heap = heaps.get(stratum);
      if (!heap) {
        heap = new MaxHeap();
        heaps.set(stratum, heap);
      }
      if (heap.size < opts.candidateCapPerStratum) heap.push({ priority, rec });
      else if (priority < heap.top().priority) heap.replaceTop({ priority, rec });
    });
  };

  for (const source of sourceOrder) {
    rowIndex.set(source, 0);
    let batch: Pending[] = [];
    for (const raw of bySource.get(source)!) {
      if (opts.shouldCancel?.()) throw new Error("cancelled");
      const row = rowIndex.get(source)!;
      rowIndex.set(source, row + 1);
      totalRows++;
      done++;
      const messages = canonicalMessages(raw.messages);
      if (messages === null) {
        issues.malformed++;
        note("malformed", source, row, raw.messages);
        continue;
      }
      batch.push({ source, row, messages, out: opts.whitespace === "keep" ? keepMessages(raw.messages)! : messages });
      if (batch.length >= batchSize) {
        processBatch(batch);
        batch = [];
        opts.onProgress?.(done, total);
      }
    }
    processBatch(batch);
    opts.onProgress?.(done, total);
  }

  const candidates = new Map<string, PoolRecord[]>();
  for (const [stratum, heap] of heaps) {
    candidates.set(
      stratum,
      heap.items.map((i) => i.rec).sort((a, b) => a.sourceRow - b.sourceRow || (a.exampleId < b.exampleId ? -1 : a.exampleId > b.exampleId ? 1 : 0)),
    );
  }
  return { candidates, stratumCounts, stratumTokens, sourceRows, issues, issueExamples, review, totalRows };
}
