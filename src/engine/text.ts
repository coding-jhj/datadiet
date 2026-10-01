/**
 * Python's `\s` (str patterns) is not JS's `\s`: it includes \x1c-\x1f and \x85
 * and does NOT include ﻿. All whitespace logic goes through these.
 */
export const PY_WS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const WS_RUN = new RegExp(`[${PY_WS}]+`, "gu");
const WS_LEAD = new RegExp(`^[${PY_WS}]+`, "u");
const WS_TRAIL = new RegExp(`[${PY_WS}]+$`, "u");

export function pyStrip(s: string): string {
  return s.replace(WS_LEAD, "").replace(WS_TRAIL, "");
}

export function collapseWhitespace(s: string): string {
  return pyStrip(s.replace(WS_RUN, " "));
}

/** len(re.findall(r"\S", s)) */
function isPyWs(c: number): boolean {
  if (c <= 32) return c === 32 || (c >= 9 && c <= 13) || (c >= 28 && c <= 31);
  if (c < 0x85) return false;
  return c === 0x85 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

export function countNonSpace(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isPyWs(c)) continue;
    n++;
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
  }
  return n;
}

export function asciiWords(lowerText: string): string[] {
  return lowerText.match(/[A-Za-z]+/g) ?? [];
}

export function asciiLetterCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) | 32;
    if (c >= 97 && c <= 122 && s.charCodeAt(i) < 128) n++;
  }
  return n;
}

/** len(re.findall(r"\w+", s)) with Python's Unicode \w */
export function wordTokenCount(s: string): number {
  return (s.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** Python round(x, 6) (round-half-even on the exact binary value). */
export function pyRound6(x: number): number {
  const scaled = x * 128;
  if (Number.isInteger(scaled) && Math.abs(scaled % 2) === 1) {
    const n = x * 1e6; // exactly representable, ends in .5
    const lo = Math.floor(n);
    return (lo % 2 === 0 ? lo : lo + 1) / 1e6;
  }
  return Number(x.toFixed(6));
}

/** Compare by Unicode code point (Python str ordering). */
export function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i)!;
    const cb = b.codePointAt(j)!;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  return a.length - i > b.length - j ? 1 : a.length - i < b.length - j ? -1 : 0;
}
