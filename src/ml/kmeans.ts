import { MT19937 } from "@/engine/rng";

/**
 * Deterministic k-means (k-means++ init, Lloyd iterations, best of n_init by inertia).
 * Approximates sklearn's MiniBatchKMeans(n_init=3): labels differ, cluster quality is
 * checked statistically in tests/ml/kmeans.test.ts.
 */
export function kmeans(points: ArrayLike<number>[], k: number, seed: number, nInit = 3, maxIter = 100): Int32Array {
  const n = points.length;
  if (n === 0) return new Int32Array(0);
  k = Math.max(1, Math.min(k, n));
  const dim = points[0]!.length;
  const rng = new MT19937(seed);
  const unit = () => rng.getrandbits(32) / 4294967296;
  const dist2 = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < dim; i++) {
      const d = a[i]! - b[i]!;
      s += d * d;
    }
    return s;
  };

  let best: { labels: Int32Array; inertia: number } | null = null;
  for (let run = 0; run < nInit; run++) {
    const centers: Float64Array[] = [Float64Array.from(points[Math.floor(unit() * n)]!)];
    const minD = new Float64Array(n).fill(Infinity);
    while (centers.length < k) {
      const last = centers[centers.length - 1]!;
      let total = 0;
      for (let i = 0; i < n; i++) {
        minD[i] = Math.min(minD[i]!, dist2(points[i]!, last));
        total += minD[i]!;
      }
      let pick = n - 1;
      if (total > 0) {
        let r = unit() * total;
        for (let i = 0; i < n; i++) {
          r -= minD[i]!;
          if (r <= 0) {
            pick = i;
            break;
          }
        }
      } else pick = Math.floor(unit() * n);
      centers.push(Float64Array.from(points[pick]!));
    }
    const labels = new Int32Array(n).fill(-1);
    let inertia = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      inertia = 0;
      for (let i = 0; i < n; i++) {
        let bl = 0;
        let bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = dist2(points[i]!, centers[c]!);
          if (d < bd) {
            bd = d;
            bl = c;
          }
        }
        inertia += bd;
        if (labels[i] !== bl) {
          labels[i] = bl;
          changed = true;
        }
      }
      if (!changed) break;
      const sums = centers.map(() => new Float64Array(dim));
      const counts = new Int32Array(k);
      for (let i = 0; i < n; i++) {
        const c = labels[i]!;
        counts[c]!++;
        const s = sums[c]!;
        for (let d = 0; d < dim; d++) s[d]! += points[i]![d]!;
      }
      for (let c = 0; c < k; c++) {
        if (counts[c] === 0) continue;
        for (let d = 0; d < dim; d++) centers[c]![d] = sums[c]![d]! / counts[c]!;
      }
    }
    if (!best || inertia < best.inertia) best = { labels, inertia };
  }
  return best!.labels;
}

export function inertia(points: ArrayLike<number>[], labels: ArrayLike<number>): number {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < points.length; i++) {
    const l = labels[i]!;
    (groups.get(l) ?? groups.set(l, []).get(l)!).push(i);
  }
  let total = 0;
  const dim = points[0]?.length ?? 0;
  for (const idx of groups.values()) {
    const c = new Float64Array(dim);
    for (const i of idx) for (let d = 0; d < dim; d++) c[d]! += points[i]![d]! / idx.length;
    for (const i of idx) for (let d = 0; d < dim; d++) total += (points[i]![d]! - c[d]!) ** 2;
  }
  return total;
}
