import { cmpStr } from "./text";

/** Port of token_quotas: proportional to pre-cap stratum tokens, largest remainder. */
export function tokenQuotas(stratumTokens: Record<string, number>, targetTokens: number): Record<string, number> {
  const keys = Object.keys(stratumTokens);
  let total = 0;
  for (const k of keys) total += stratumTokens[k]!;
  if (!total) return {};
  const raw: Record<string, number> = {};
  const quotas: Record<string, number> = {};
  let sum = 0;
  for (const k of keys) {
    raw[k] = (targetTokens * stratumTokens[k]!) / total;
    quotas[k] = Math.floor(raw[k]!);
    sum += quotas[k]!;
  }
  const remainder = targetTokens - sum;
  const order = [...keys].sort((a, b) => {
    const fa = -(raw[a]! - quotas[a]!);
    const fb = -(raw[b]! - quotas[b]!);
    return fa < fb ? -1 : fa > fb ? 1 : cmpStr(a, b);
  });
  for (const k of order.slice(0, remainder)) quotas[k]! += 1;
  return quotas;
}
