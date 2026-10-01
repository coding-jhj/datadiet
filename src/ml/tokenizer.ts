import type { Message } from "@/engine/types";

export type TokenizerKind = "qwen-real" | "estimate";

export interface TokenizerProvider {
  kind: TokenizerKind;
  label: string;
  count(batch: Message[][]): number[];
}

export const QWEN_TOKENIZER_ID = "Qwen/Qwen3-1.7B-Base";
export const QWEN_TOKENIZER_REVISION = "ea980cb0a6c2ae4b936e82123acc929f1cec04c1";

/**
 * Fallback when the real tokenizer cannot be loaded. About 3.6 characters per token for
 * English text plus ChatML framing per message. Counts are approximate; the UI must say so.
 */
export function estimateTokenCount(messages: Message[]): number {
  let total = 0;
  for (const m of messages) total += 5 + Math.ceil(m.content.length / 3.6);
  return total;
}

export const estimateProvider: TokenizerProvider = {
  kind: "estimate",
  label: "Estimated token counts (real tokenizer unavailable)",
  count: (batch) => batch.map(estimateTokenCount),
};

/**
 * transformers.js splits the template's "<think>" / "</think>" markers into several pieces,
 * while the study's Python tokenizer treats each marker as one token. Rendering the template to
 * text and encoding around those two markers reproduces the Python count.
 */
export function countChatTokens(tok: { apply_chat_template: (...a: any[]) => any; encode: (t: string, o?: any) => any }, messages: Message[]): number {
  const text: string = tok.apply_chat_template(messages, { tokenize: false, add_generation_prompt: false });
  let total = 0;
  for (const part of text.split(/(<think>|<\/think>)/)) {
    if (part === "") continue;
    if (part === "<think>" || part === "</think>") total += 1;
    else {
      const ids: any = tok.encode(part, { add_special_tokens: false });
      total += Array.isArray(ids) ? ids.length : (ids.length ?? Array.from(ids.data ?? ids).length);
    }
  }
  return total;
}

/** Loads the real Qwen3 tokenizer through transformers.js. Throws if the download fails. */
export async function loadQwenTokenizer(opts: { revision?: string; onProgress?: (p: number) => void } = {}): Promise<TokenizerProvider> {
  const { AutoTokenizer } = await import("@huggingface/transformers");
  const tok: any = await AutoTokenizer.from_pretrained(QWEN_TOKENIZER_ID, {
    revision: opts.revision ?? QWEN_TOKENIZER_REVISION,
    progress_callback: (e: any) => {
      if (typeof e?.progress === "number") opts.onProgress?.(e.progress);
    },
  });
  const countOne = (messages: Message[]) => countChatTokens(tok, messages);
  return {
    kind: "qwen-real",
    label: "Qwen3 tokenizer (same as the study)",
    count: (batch) => batch.map(countOne),
  };
}

/** Try the real tokenizer, fall back to the estimate. */
export async function loadTokenizerWithFallback(onProgress?: (p: number) => void): Promise<TokenizerProvider> {
  try {
    return await loadQwenTokenizer({ onProgress });
  } catch {
    return estimateProvider;
  }
}
