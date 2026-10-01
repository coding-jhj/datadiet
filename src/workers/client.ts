import * as Comlink from "comlink";
import type { PipelineApi } from "./pipeline.worker";

export interface Pipeline {
  api: Comlink.Remote<PipelineApi>;
  terminate(): void;
}

export function createPipeline(): Pipeline {
  const worker = new Worker(new URL("./pipeline.worker.ts", import.meta.url), { type: "module" });
  return { api: Comlink.wrap<PipelineApi>(worker), terminate: () => worker.terminate() };
}
export { proxy } from "comlink";
