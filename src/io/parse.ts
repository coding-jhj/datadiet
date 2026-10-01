import type { RawRow } from "@/engine/types";

export const LIMITS = { maxBytes: 40 * 1024 * 1024, maxRows: 60_000 } as const;
export const DEFAULT_SOURCE = "your-data";

export interface Unreadable {
  line: number;
  reason: string;
}

export interface ParseResult {
  rows: RawRow[];
  unreadable: Unreadable[];
  format: "jsonl" | "json" | "empty" | "unknown";
  /** true when more than LIMITS.maxRows rows were present and the rest was ignored */
  truncated: boolean;
  tooBig: boolean;
}

function toRow(value: unknown): RawRow | null {
  if (Array.isArray(value)) return { source: DEFAULT_SOURCE, messages: value };
  if (value === null || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const source = typeof obj.source === "string" && obj.source.trim() ? obj.source.trim() : DEFAULT_SOURCE;
  if (Array.isArray(obj.messages)) return { source, messages: obj.messages };
  const prompt = obj.prompt ?? obj.instruction ?? obj.question;
  const answer = obj.response ?? obj.completion ?? obj.output ?? obj.answer;
  if (typeof prompt === "string" && typeof answer === "string") {
    return { source, messages: [{ role: "user", content: prompt }, { role: "assistant", content: answer }] };
  }
  return null;
}

export function parseInput(text: string, byteLength: number = text.length): ParseResult {
  const empty: ParseResult = { rows: [], unreadable: [], format: "empty", truncated: false, tooBig: false };
  if (byteLength > LIMITS.maxBytes) return { ...empty, format: "unknown", tooBig: true };
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return empty;

  const rows: RawRow[] = [];
  const unreadable: Unreadable[] = [];
  let truncated = false;
  const add = (row: RawRow | null, line: number, reason: string) => {
    if (row === null) unreadable.push({ line, reason });
    else if (rows.length >= LIMITS.maxRows) truncated = true;
    else rows.push(row);
  };

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.every((x) => x !== null && typeof x === "object" && !Array.isArray(x))) {
        arr.forEach((v, i) => add(toRow(v), i + 1, "No messages found in this item"));
        return { rows, unreadable, format: "json", truncated, tooBig: false };
      }
    } catch {
      /* fall through to line-by-line */
    }
  }

  const lines = trimmed.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      add(null, i + 1, "Not valid JSON");
      return;
    }
    add(toRow(value), i + 1, "No messages found in this line");
  });
  const format = rows.length === 0 ? "unknown" : "jsonl";
  return { rows, unreadable, format, truncated, tooBig: false };
}
