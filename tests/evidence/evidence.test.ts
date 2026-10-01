import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import evidenceJson from "../../src/evidence/evidence.generated.json";
import { EvidenceSchema } from "../../src/evidence/schema";

const ROOT = join(__dirname, "../..");
const evidence = EvidenceSchema.parse(evidenceJson);
const manuscript = readFileSync(join(ROOT, "data/paper/paper/manuscript.md"), "utf8");

const f2 = (x: number) => x.toFixed(2);
const signed = (x: number) => (x >= 0 ? `+${f2(x)}` : f2(x));

describe("vendored paper package integrity", () => {
  const vendored = JSON.parse(readFileSync(join(ROOT, "data/paper/VENDORED.json"), "utf8"));
  it("every vendored file matches its recorded sha256", () => {
    for (const [rel, sha] of Object.entries<string>(vendored.files)) {
      const actual = createHash("sha256").update(readFileSync(join(ROOT, "data/paper", rel))).digest("hex");
      expect(actual, rel).toBe(sha);
    }
  });
  it("reference select_data.py is the recorded, unmodified file", () => {
    const actual = createHash("sha256").update(readFileSync(join(ROOT, "tools/reference/select_data.py"))).digest("hex");
    expect(actual).toBe(vendored.reference_code["tools/reference/select_data.py"]);
    const meta = JSON.parse(readFileSync(join(ROOT, "tests/golden/meta.json"), "utf8"));
    expect(meta.select_data_sha256).toBe(actual);
  });
  it("evidence.generated.json lists only vendored sources with matching hashes", () => {
    for (const [rel, sha] of Object.entries(evidence.source.files)) {
      expect(vendored.files[rel], rel).toBe(sha);
    }
  });
});

describe("evidence numbers agree with the manuscript text", () => {
  it("primary 2-seed and expanded contrasts appear as 'X pp [lo, hi]'", () => {
    for (const c of evidence.contrasts.filter((x) => x.protocol === "primary-2seed" || x.protocol === "expanded-single-seed")) {
      // the manuscript tables only list diversity for expanded, quality+diversity for primary
      const needle = `${signed(c.point)} pp [${f2(c.lo)}, ${f2(c.hi)}]`;
      expect(manuscript.includes(needle), `${c.id}: ${needle}`).toBe(true);
    }
  });

  it("3-seed pooled contrasts appear with their intervals", () => {
    for (const c of evidence.contrasts.filter((x) => x.protocol === "mixed-3seed" && x.metric !== "ifeval_instruction_strict")) {
      expect(manuscript.includes(`[${f2(c.lo)}, ${f2(c.hi)}]`), c.id).toBe(true);
      expect(manuscript.includes(`${signed(c.point)} percentage points`) || manuscript.includes(`${signed(c.point)} points`), c.id).toBe(true);
    }
  });

  it("2-seed policy means and standard deviations appear in the results table", () => {
    const metrics = ["ifeval_prompt_strict", "ifeval_instruction_strict", "gsm8k_accuracy", "bbh_accuracy"] as const;
    for (const policy of ["random", "quality", "diversity"] as const) {
      for (const m of metrics) {
        const { mean, sd } = evidence.means2Seed[policy]![m]!;
        expect(manuscript.includes(`${f2(mean)}% ± ${f2(sd)}`), `${policy}.${m}`).toBe(true);
      }
    }
  });

  it("base-model baseline and validity counts appear", () => {
    const b = evidence.meansFollowup.base;
    expect(manuscript).toContain(`IFEval ${f2(b.ifeval_prompt_strict!)}%`.replace("IFEval ", "IFEval ").replace("%", "%"));
    expect(manuscript).toContain(`GSM8K ${f2(b.gsm8k_accuracy!)}%`);
    expect(manuscript).toContain(`BBH ${f2(b.bbh_accuracy!)}%`);
    expect(manuscript).toContain(evidence.validity.primary.flagged.toLocaleString("en-US"));
    expect(manuscript).toContain(evidence.validity.primary.total.toLocaleString("en-US"));
    expect(manuscript).toContain(evidence.validity.seed2026.flagged.toLocaleString("en-US"));
  });

  it("every run consumed exactly the fixed token budget", () => {
    for (const run of evidence.runStats.runs) expect(run.tokensSeen).toBe(evidence.conditions.budgetTokens);
    expect(evidence.runStats.runs).toHaveLength(8);
  });

  it("protocol caps differ between primary and follow-up (mixed-protocol label is justified)", () => {
    expect(evidence.protocols.primary).not.toEqual(evidence.protocols.followup);
  });
});
