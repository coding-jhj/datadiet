import { sha256Hex } from "@/engine/hash";
import type { DiversityDeps } from "@/engine/orders";
import { kmeans } from "./kmeans";

export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export interface Embedder {
  id: string;
  /** L2-normalised vectors */
  embed(texts: string[], onProgress?: (done: number, total: number) => void): Promise<Float32Array[]>;
}

/** Deterministic offline embedder for tests and the "demo without downloads" path. Not semantic. */
export function hashEmbedder(dim = 32): Embedder {
  return {
    id: `hash-${dim}`,
    async embed(texts) {
      return texts.map((t) => {
        const hex = sha256Hex(t);
        const v = new Float32Array(dim);
        let norm = 0;
        for (let i = 0; i < dim; i++) {
          v[i] = parseInt(hex.slice((i * 2) % 62, ((i * 2) % 62) + 2), 16) / 255 - 0.5;
          norm += v[i]! * v[i]!;
        }
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < dim; i++) v[i]! /= norm;
        return v;
      });
    },
  };
}

export async function loadMiniLM(opts: { onProgress?: (p: number) => void; device?: "webgpu" | "wasm" } = {}): Promise<Embedder> {
  const { pipeline } = await import("@huggingface/transformers");
  const extractor: any = await pipeline("feature-extraction", EMBED_MODEL_ID, {
    device: opts.device ?? "wasm",
    dtype: "q8",
    progress_callback: (e: any) => {
      if (typeof e?.progress === "number") opts.onProgress?.(e.progress);
    },
  });
  return {
    id: EMBED_MODEL_ID,
    async embed(texts, onProgress) {
      const out: Float32Array[] = [];
      const batch = 16;
      for (let i = 0; i < texts.length; i += batch) {
        const slice = texts.slice(i, i + batch);
        const t: any = await extractor(slice, { pooling: "mean", normalize: true });
        const dim = t.dims[1] as number;
        for (let j = 0; j < slice.length; j++) out.push(Float32Array.from(t.data.slice(j * dim, (j + 1) * dim)));
        onProgress?.(Math.min(i + batch, texts.length), texts.length);
      }
      return out;
    },
  };
}

/**
 * Embed every candidate text once (async), then hand the selection engine a synchronous
 * lookup so the ported Python logic stays synchronous.
 */
export async function makeDiversityDeps(
  texts: string[],
  embedder: Embedder,
  onProgress?: (done: number, total: number) => void,
): Promise<DiversityDeps> {
  const unique = [...new Set(texts)];
  const vectors = await embedder.embed(unique, onProgress);
  const table = new Map(unique.map((t, i) => [t, vectors[i]!]));
  return {
    embed: (ts) => ts.map((t) => table.get(t) ?? (() => { throw new Error("text was not pre-embedded"); })()),
    cluster: (emb, k, seed) => kmeans(emb, k, seed),
  };
}
