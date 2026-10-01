import { describe, expect, it } from "vitest";
import { copy } from "@/copy/en";

function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (typeof v === "function") return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

const ALLOWED_DIGITS = new Set(["landing.cta", "evidence.likelyRangeTip"]);
const CLAIM_SECTIONS = ["verdict", "tiers", "evidence", "how", "landing"];
const FORBIDDEN = /\b(better|outperforms?|always|generally|equivalent|proven)\b/i;

describe("copy rules", () => {
  const all = strings(copy);
  it("has no hard-coded numbers outside the allow-list", () => {
    const bad = all.filter(([p, s]) => /\d/.test(s) && !ALLOWED_DIGITS.has(p));
    expect(bad).toEqual([]);
  });
  it("evidence-facing text avoids overclaiming words", () => {
    const bad = all.filter(([p, s]) => CLAIM_SECTIONS.includes(p.split(/[.[]/)[0]!) && FORBIDDEN.test(s.replace("Promising, not proven", "")));
    expect(bad).toEqual([]);
  });
});
