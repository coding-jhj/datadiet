import { create } from "zustand";
import { buildHealth, type HealthSummary } from "@/engine/health";
import type { Goal } from "@/evidence/recommend";
import { parseInput, type ParseResult } from "@/io/parse";
import type { PoolSummary, ProgressEvent, SelectOutput } from "@/workers/protocol";
import { createPipeline, proxy, type Pipeline } from "@/workers/client";

export const APP_VERSION = "0.1.0";
const params = () => new URLSearchParams(window.location.search);
export const isMock = () => params().get("mock") === "1";

export interface Advanced {
  seed: number;
  cap: number;
  exactFit: boolean;
  keepWhitespace: boolean;
}

export interface RunMeta {
  goal: Goal;
  target: number;
  advanced: Advanced;
  tokenizer: "qwen-real" | "estimate";
}

interface State {
  goal: Goal | null;
  parse: ParseResult | null;
  fileName: string | null;
  analysis: PoolSummary | null;
  health: HealthSummary | null;
  analyzing: boolean;
  target: number;
  advanced: Advanced;
  running: boolean;
  progress: ProgressEvent | null;
  output: SelectOutput | null;
  meta: RunMeta | null;
  error: string | null;
  setGoal(g: Goal): void;
  setTarget(n: number): void;
  setAdvanced(a: Partial<Advanced>): void;
  loadText(text: string, name: string, bytes?: number): Promise<void>;
  loadSample(): Promise<void>;
  run(): Promise<boolean>;
  reanalyze(): Promise<void>;
  cancel(): void;
  reset(): void;
}

let pipeline: Pipeline | null = null;
const fresh = () => {
  pipeline?.terminate();
  pipeline = createPipeline();
  return pipeline;
};

export const DEFAULT_ADVANCED: Advanced = { seed: 13, cap: 1000, exactFit: true, keepWhitespace: true };

export const useStore = create<State>((set, get) => ({
  goal: null,
  parse: null,
  fileName: null,
  analysis: null,
  health: null,
  analyzing: false,
  target: 100_000,
  advanced: DEFAULT_ADVANCED,
  running: false,
  progress: null,
  output: null,
  meta: null,
  error: null,

  setGoal: (goal) => set({ goal }),
  setTarget: (target) => set({ target }),
  setAdvanced: (a) => set((s) => ({ advanced: { ...s.advanced, ...a } })),

  async loadText(text, name, bytes) {
    const parse = parseInput(text, bytes ?? text.length);
    set({ parse, fileName: name, analysis: null, health: null, output: null, error: null });
    if (parse.rows.length === 0) return;
    await analyzeNow(set, get);
  },

  async loadSample() {
    set({ error: null });
    try {
      const url = new URL("sample/smoltalk-sample.jsonl", document.baseURI);
      const res = await fetch(url);
      if (!res.ok) throw new Error("sample");
      await get().loadText(await res.text(), "sample.jsonl");
    } catch {
      set({ error: "The sample couldn't be loaded. Check your connection and try again." });
    }
  },

  async run() {
    const { analysis, goal, target, advanced } = get();
    if (!analysis || !goal || !pipeline) return false;
    set({ running: true, progress: { stage: "picking", done: 0, total: 1 }, error: null, output: null });
    try {
      const out = await pipeline.api.select(
        {
          targetTokens: target,
          seed: advanced.seed,
          qualityFloor: 0.55,
          exactFit: advanced.exactFit,
          policies: ["random", "quality", "diversity"],
          embedder: isMock() ? "mock" : "real",
        },
        proxy((e: ProgressEvent) => set({ progress: e })),
      );
      set({ output: out, running: false, progress: null, meta: { goal, target, advanced, tokenizer: analysis.tokenizer } });
      return true;
    } catch (e) {
      if (get().running) set({ running: false, progress: null, error: e instanceof Error ? e.message : "Something went wrong." });
      return false;
    }
  },

  async reanalyze() {
    await analyzeNow(set, get);
  },

  cancel() {
    pipeline?.terminate();
    pipeline = null;
    set({ running: false, progress: null, analysis: null, health: null });
    const { parse, fileName } = get();
    if (parse && fileName) void analyzeNow(set, get);
  },

  reset() {
    pipeline?.terminate();
    pipeline = null;
    set({ goal: null, parse: null, fileName: null, analysis: null, health: null, output: null, meta: null, running: false, progress: null, error: null, target: 100_000, advanced: DEFAULT_ADVANCED });
  },
}));

async function analyzeNow(set: (p: Partial<State>) => void, get: () => State) {
  const { parse, advanced } = get();
  if (!parse) return;
  const p = fresh();
  set({ analyzing: true, progress: { stage: "reading", done: 0, total: 1 }, error: null });
  try {
    const analysis = await p.api.analyze(
      { rows: parse.rows, candidateCap: advanced.cap, maxLength: 2048, poolSeed: 0, whitespace: advanced.keepWhitespace ? "keep" : "collapse", realTokenizer: !isMock() },
      proxy((e: ProgressEvent) => set({ progress: e })),
    );
    const health = buildHealth(parse, analysis);
    set({ analysis, health, analyzing: false, progress: null, target: analysis.availableTokens >= 250_000 ? 100_000 : Math.max(1000, Math.floor((analysis.availableTokens * 0.4) / 1000) * 1000) });
  } catch (e) {
    set({ analyzing: false, progress: null, error: e instanceof Error ? e.message : "Something went wrong." });
  }
}
