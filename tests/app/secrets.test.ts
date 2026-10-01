import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", "dist", "test-results", "playwright-report", "golden", "paper", "package-lock.json"]);
const PATTERNS: [string, RegExp][] = [
  ["Hugging Face token", /\bhf_[A-Za-z0-9]{20,}\b/],
  ["OpenAI/Anthropic-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["email address", /[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[a-z]{2,}/],
  ["Korean mobile number", /\b01[016789]-?\d{3,4}-?\d{4}\b/],
  ["local user path", /C:\\Users\\|\/Users\/[a-z]+\/|\/home\/[a-z]+\//],
];

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) yield* walk(f);
    else if (/\.(ts|tsx|js|mjs|json|md|html|css|py|yml|jsonl|csv)$/.test(n) && statSync(f).size < 3_000_000) yield f;
  }
}

describe("no secrets or personal data in the shipped source", () => {
  it("scans every text file", () => {
    const hits: string[] = [];
    for (const f of walk(ROOT)) {
      if (f.endsWith("secrets.test.ts")) continue;
      const text = readFileSync(f, "utf8");
      for (const [name, re] of PATTERNS) {
        const m = re.exec(text);
        if (m) hits.push(`${f.replace(ROOT, "")}: ${name}: ${m[0].slice(0, 40)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
