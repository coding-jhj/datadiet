import { asciiLetterCount, asciiWords, countNonSpace, pyRound6, wordTokenCount } from "./text";
import type { Message } from "./types";

export const LENGTH_BINS: ReadonlyArray<readonly [number, number]> = [
  [0, 256],
  [256, 512],
  [512, 1024],
  [1024, 1536],
  [1536, 2049],
];

const ENGLISH_WORDS = new Set(["a", "an", "and", "are", "for", "from", "how", "in", "is", "of", "please", "the", "to", "what", "why", "with"]);

export function lengthBin(tokenCount: number): string {
  for (const [lo, hi] of LENGTH_BINS) if (lo <= tokenCount && tokenCount < hi) return `${lo}-${hi - 1}`;
  throw new Error(`Unsupported token count: ${tokenCount}`);
}

export function isBinnable(tokenCount: number): boolean {
  return tokenCount >= 0 && tokenCount < 2049;
}

/** True if some non-newline code point repeats at least `run` times in a row (Python `(.)\1{run-1,}`). */
export function hasRepeatRun(text: string, run: number): boolean {
  let prev = -1;
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    if (cp === 10) {
      prev = -1;
      count = 0;
      continue;
    }
    if (cp === prev) {
      if (++count >= run) return true;
    } else {
      prev = cp;
      count = 1;
    }
  }
  return false;
}

interface Analysis {
  text: string;
  words: string[];
  letters: number;
  nonSpace: number;
}
const memo = new WeakMap<Message[], Analysis>();
function analyze(messages: Message[]): Analysis {
  let a = memo.get(messages);
  if (!a) {
    const text = messages.map((m) => m.content).join(" ");
    a = { text, words: asciiWords(text.toLowerCase()), letters: asciiLetterCount(text), nonSpace: countNonSpace(text) };
    memo.set(messages, a);
  }
  return a;
}

export function textQuality(messages: Message[], tokenCount: number): number {
  const { text, words, letters, nonSpace } = analyze(messages);
  if (words.length === 0) return 0.0;
  let hits = 0;
  for (const w of words) if (ENGLISH_WORDS.has(w)) hits++;
  const englishSignal = Math.min(1.0, hits / 4.0);
  const asciiRatio = letters / Math.max(1, nonSpace);
  const englishScore = 0.5 * englishSignal + 0.5 * Math.min(1.0, asciiRatio);

  const assistantText = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join(" ");
  const responseScore = Math.min(1.0, wordTokenCount(assistantText) / 80.0);
  const lengthScore = 32 <= tokenCount && tokenCount <= 1536 ? 1.0 : 0.7;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  let repeated = 0;
  for (const c of counts.values()) if (c > 3) repeated += c - 1;
  const repetitionScore = Math.max(0.0, 1.0 - repeated / Math.max(1, words.length));
  const artifactScore = text.includes("\x00") || hasRepeatRun(text, 10) ? 0.0 : 1.0;
  return pyRound6(0.25 * englishScore + 0.25 * responseScore + 0.2 * lengthScore + 0.2 * repetitionScore + 0.1 * artifactScore);
}

export type HardInvalidReason = "tooLong" | "empty" | "tooFewWords" | "notEnglish" | "repeatedChars";

/** null = valid; otherwise the first failing rule (same order as the Python function). */
export function hardInvalidReason(messages: Message[], tokenCount: number, maxLength: number): HardInvalidReason | null {
  if (tokenCount <= 0) return "empty";
  if (tokenCount > maxLength) return "tooLong";
  const { text, words, letters, nonSpace } = analyze(messages);
  if (words.length < 4 || letters < 20) return "tooFewWords";
  if (letters / Math.max(1, nonSpace) < 0.25) return "notEnglish";
  if (text.includes("\x00") || hasRepeatRun(text, 13)) return "repeatedChars";
  return null;
}

export function hardValid(messages: Message[], tokenCount: number, maxLength: number): boolean {
  return hardInvalidReason(messages, tokenCount, maxLength) === null;
}
