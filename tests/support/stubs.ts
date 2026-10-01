import { createHash } from "node:crypto";
import type { Message } from "@/engine/types";

/** Must stay in sync with tools/reference/stubs.py */
export function stubTokenCount(messages: Message[]): number {
  let total = 3;
  for (const m of messages) total += 4 + 6 * (m.content.split(" ").length - 1 + 1);
  return total;
}

export function stubEmbedding(text: string): number[] {
  const digest = createHash("sha256").update(text, "utf8").digest();
  const v: number[] = [];
  for (let i = 0; i < 8; i++) v.push(digest[i]! / 255.0 - 0.5);
  let sq = 0.0;
  for (const x of v) sq += x * x;
  const norm = Math.sqrt(sq);
  return v.map((x) => x / norm);
}

export function stubLabel(first: number, k: number, randomState: number): number {
  const v = Math.floor((first + 1.0) * 0.5 * k) + randomState;
  return ((v % k) + k) % k;
}

export const stubDeps = {
  embed: (texts: string[]) => texts.map(stubEmbedding),
  cluster: (emb: ArrayLike<number>[], k: number, seed: number) => emb.map((row) => stubLabel(row[0]!, k, seed)),
};
