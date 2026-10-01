import type { Contrast, Evidence, MetricId, PolicyId, ProtocolId } from "./schema";

export type Goal = "instructions" | "reasoning" | "math" | "unsure";
export type Tier = "no-gain" | "promising" | "unclear";
export type Agreement = "all" | "some" | "none";

export interface Recommendation {
  goal: Goal;
  policy: PolicyId;
  tier: Tier;
  agreement: Agreement;
  refs: Contrast[];
  /** the mapping is our reading of the study, not a conclusion the paper states */
  interpretation: boolean;
}

export const GOAL_METRIC: Record<Exclude<Goal, "unsure">, MetricId> = {
  instructions: "ifeval_prompt_strict",
  reasoning: "bbh_accuracy",
  math: "gsm8k_accuracy",
};

export const PROTOCOL_ORDER: ProtocolId[] = ["primary-2seed", "mixed-3seed", "expanded-single-seed", "seed2026-only"];

export function contrastsFor(ev: Evidence, treatment: PolicyId, metric: MetricId, protocols: ProtocolId[] = PROTOCOL_ORDER): Contrast[] {
  return protocols.flatMap((p) => ev.contrasts.filter((c) => c.treatment === treatment && c.metric === metric && c.protocol === p));
}

export const excludesZero = (c: Contrast) => c.lo > 0 || c.hi < 0;

/** Tier rules from the product spec, computed only from the evidence numbers. */
export function tierOf(refs: Contrast[], primary: boolean): { tier: Tier; agreement: Agreement } {
  if (refs.length === 0) return { tier: "unclear", agreement: "none" };
  const positive = refs.filter((c) => excludesZero(c) && c.point > 0).length;
  const agreement: Agreement = positive === refs.length ? "all" : positive > 0 ? "some" : "none";
  if (primary && refs.every((c) => !excludesZero(c))) return { tier: "no-gain", agreement };
  if (!primary && agreement === "all") return { tier: "promising", agreement };
  if (!primary && positive >= 2 && refs.every((c) => c.point > 0)) return { tier: "promising", agreement };
  if (primary) return { tier: "unclear", agreement };
  return { tier: "unclear", agreement };
}

const FOLLOWED = ["primary-2seed", "mixed-3seed", "expanded-single-seed"] as ProtocolId[];

export function recommend(goal: Goal, ev: Evidence): Recommendation {
  if (goal === "instructions") {
    const refs = contrastsFor(ev, "diversity", GOAL_METRIC.instructions, ["primary-2seed", "mixed-3seed"]);
    return { goal, policy: "random", ...tierOf(refs, true), refs, interpretation: true };
  }
  if (goal === "reasoning" || goal === "math") {
    const refs = contrastsFor(ev, "diversity", GOAL_METRIC[goal], FOLLOWED);
    return { goal, policy: "diversity", ...tierOf(refs, false), refs, interpretation: false };
  }
  const refs = [
    ...contrastsFor(ev, "diversity", GOAL_METRIC.instructions, ["primary-2seed", "mixed-3seed"]),
    ...contrastsFor(ev, "diversity", GOAL_METRIC.reasoning, FOLLOWED),
    ...contrastsFor(ev, "diversity", GOAL_METRIC.math, FOLLOWED),
  ];
  const secondary = refs.filter((c) => c.metric !== GOAL_METRIC.instructions);
  const t = tierOf(secondary, false);
  return { goal, policy: "diversity", tier: t.tier === "no-gain" ? "unclear" : t.tier, agreement: t.agreement, refs, interpretation: true };
}

/** Cleanest-first is never recommended; this tells the compare card what to say. */
export function qualityVerdict(ev: Evidence): { tier: Tier; refs: Contrast[] } {
  const refs = ev.contrasts.filter((c) => c.treatment === "quality");
  return { tier: refs.every((c) => !excludesZero(c)) ? "no-gain" : "unclear", refs };
}
