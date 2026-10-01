import { describe, expect, it } from "vitest";
import { buildHealth } from "@/engine/health";
import { buildPool } from "@/engine/pool";
import { trainingJsonl, manifestCsv } from "@/engine/export";
import { evidence } from "@/evidence";
import { fmtPp, fmtRange } from "@/evidence/format";
import { qualityVerdict, recommend } from "@/evidence/recommend";
import { parseInput } from "@/io/parse";
import { estimateProvider } from "@/ml/tokenizer";

describe("parseInput", () => {
  it("reads JSONL, reports bad lines, accepts prompt/response pairs", () => {
    const text = ['{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"yo"}]}', "not json", '{"prompt":"q","response":"a"}', '{"x":1}'].join("\n");
    const r = parseInput(text);
    expect(r.format).toBe("jsonl");
    expect(r.rows).toHaveLength(2);
    expect(r.unreadable.map((u) => u.line)).toEqual([2, 4]);
  });
  it("reads a JSON array and an empty file, rejects oversize", () => {
    expect(parseInput('[{"messages":[]}]').format).toBe("json");
    expect(parseInput("   ").format).toBe("empty");
    expect(parseInput("x", 999_999_999).tooBig).toBe(true);
  });
  it("never throws on binary-ish garbage", () => {
    expect(() => parseInput("\u0000\u0001{{{[[[\n]]]\n\"")).not.toThrow();
  });
});

describe("health + export", () => {
  const good = { role: "user", content: "please explain how the model is trained with the data in the set" };
  const ans = { role: "assistant", content: "The model is trained with the data and the loss is reduced for the task in the set with care." };
  const rows = [
    { source: "s", messages: [good, ans] },
    { source: "s", messages: [good, ans] },
    { source: "s", messages: "nope" },
    { source: "s", messages: [{ role: "user", content: "안녕하세요 안녕하세요 안녕하세요" }, { role: "assistant", content: "반갑습니다 반갑습니다 반갑습니다 반갑습니다" }] },
  ];
  it("summarises skipped rows in user terms", () => {
    const parse = { rows, unreadable: [{ line: 9, reason: "Not valid JSON" }], format: "jsonl" as const, truncated: false, tooBig: false };
    const pool = buildPool(rows, (b) => estimateProvider.count(b), { poolSeed: 0, candidateCapPerStratum: 10, maxLength: 2048, whitespace: "keep" });
    const h = buildHealth(parse, pool);
    expect(h.usable).toBe(1);
    expect(h.total).toBe(5);
    const codes = Object.fromEntries(h.skipped.map((s) => [s.code, s.count]));
    expect(codes).toMatchObject({ unreadable: 1, missingRoles: 1, duplicate: 1, notEnglish: 1 });
    const sel = [...pool.candidates.values()].flat();
    expect(trainingJsonl(sel).trim().split("\n")).toHaveLength(1);
    expect(manifestCsv(sel).split("\n")[0]).toBe("example_id,source,source_row,length_bin,token_count,quality_score");
  });
  it("keep mode preserves whitespace in export, collapse does not", () => {
    const r = [{ source: "s", messages: [{ role: "user", content: "line one\n\nline   two of the question here please" }, ans] }];
    const keep = buildPool(r, (b) => estimateProvider.count(b), { poolSeed: 0, candidateCapPerStratum: 10, maxLength: 2048, whitespace: "keep" });
    const coll = buildPool(r, (b) => estimateProvider.count(b), { poolSeed: 0, candidateCapPerStratum: 10, maxLength: 2048 });
    expect([...keep.candidates.values()][0]![0]!.messages[0]!.content).toContain("\n\n");
    expect([...coll.candidates.values()][0]![0]!.messages[0]!.content).not.toContain("\n");
  });
});

describe("recommendation tiers come from the numbers", () => {
  it("instructions -> random, no gain", () => {
    const r = recommend("instructions", evidence);
    expect([r.policy, r.tier, r.interpretation]).toEqual(["random", "no-gain", true]);
  });
  it("reasoning -> varied, promising, all protocols agree", () => {
    const r = recommend("reasoning", evidence);
    expect([r.policy, r.tier, r.agreement]).toEqual(["diversity", "promising", "all"]);
  });
  it("math -> varied, promising, but not every protocol", () => {
    const r = recommend("math", evidence);
    expect([r.policy, r.tier, r.agreement]).toEqual(["diversity", "promising", "some"]);
  });
  it("unsure -> varied, flagged as our reading", () => {
    const r = recommend("unsure", evidence);
    expect(r.policy).toBe("diversity");
    expect(r.interpretation).toBe(true);
  });
  it("quality is never a win", () => {
    expect(qualityVerdict(evidence).tier).toBe("no-gain");
  });
  it("formats", () => {
    expect(fmtPp(-0.26)).toBe("−0.26");
    expect(fmtRange(3.4, 12.19)).toBe("+3.40 to +12.19");
  });
});
