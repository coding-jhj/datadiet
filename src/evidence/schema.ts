import { z } from "zod";

export const PolicyId = z.enum(["random", "quality", "diversity"]);
export type PolicyId = z.infer<typeof PolicyId>;

export const MetricId = z.enum(["ifeval_prompt_strict", "ifeval_instruction_strict", "gsm8k_accuracy", "bbh_accuracy"]);
export type MetricId = z.infer<typeof MetricId>;

export const ProtocolId = z.enum(["primary-2seed", "mixed-3seed", "seed2026-only", "expanded-single-seed"]);
export type ProtocolId = z.infer<typeof ProtocolId>;

const Caps = z.object({ ifeval: z.number(), gsm8k: z.number(), bbh: z.number() });

const MeanSd = z.object({ mean: z.number(), sd: z.number() });
const MetricMeans = z.record(MetricId, MeanSd);

export const Contrast = z.object({
  id: z.string(),
  protocol: ProtocolId,
  treatment: PolicyId,
  control: z.literal("random"),
  metric: MetricId,
  seeds: z.array(z.number()),
  n: z.number().int().positive(),
  /** percentage points */
  point: z.number(),
  lo: z.number(),
  hi: z.number(),
});
export type Contrast = z.infer<typeof Contrast>;

export const PerSeedContrast = z.object({
  seed: z.number().int(),
  metric: MetricId,
  n: z.number().int().positive(),
  point: z.number(),
  lo: z.number(),
  hi: z.number(),
});

export const RunStat = z.object({
  strategy: PolicyId,
  seed: z.number().int(),
  rows: z.number().int(),
  optimizerSteps: z.number().int(),
  tokensSeen: z.number().int(),
  minutes: z.number(),
});

const Validity = z.object({ flagged: z.number().int(), total: z.number().int() });

export const EvidenceSchema = z.object({
  source: z.object({
    packageName: z.string(),
    files: z.record(z.string(), z.string()),
  }),
  conditions: z.object({
    model: z.string(),
    dataset: z.string(),
    datasetRevision: z.string(),
    tokenizer: z.string(),
    embeddingModel: z.string(),
    budgetTokens: z.number().int(),
    maxLength: z.number().int(),
    qualityFloor: z.number(),
    candidateCapPerStratum: z.number().int(),
    language: z.literal("English"),
    quantization: z.string(),
  }),
  evalSubsets: z.object({
    primary: z.object({ ifeval: z.number().int(), gsm8k: z.number().int(), bbh: z.number().int() }),
    expanded: z.object({ ifeval: z.number().int(), gsm8k: z.number().int(), bbh: z.number().int() }),
  }),
  protocols: z.object({ primary: Caps, followup: Caps }),
  means2Seed: z.record(PolicyId, MetricMeans),
  meansFollowup: z.object({
    seed2026: z.record(z.enum(["random", "diversity"]), z.record(MetricId, z.number())),
    expanded: z.record(z.enum(["random", "diversity"]), z.record(MetricId, z.number())),
    base: z.record(MetricId, z.number()),
  }),
  contrasts: z.array(Contrast),
  perSeed: z.array(PerSeedContrast),
  runStats: z.object({
    runs: z.array(RunStat),
    rowsRange: z.tuple([z.number().int(), z.number().int()]),
    minutesRange: z.tuple([z.number(), z.number()]),
    gpu: z.string(),
  }),
  validity: z.object({
    primary: Validity,
    seed2026: Validity,
    expanded: Validity,
    base: Validity,
  }),
  bbhWorstTask: z.object({ maxAcrossPolicies: z.number() }),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
