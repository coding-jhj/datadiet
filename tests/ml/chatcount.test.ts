import { describe, expect, it } from "vitest";
import { countChatTokens } from "@/ml/tokenizer";

describe("countChatTokens", () => {
  it("counts <think> and </think> as one token each and encodes the rest around them", () => {
    const rendered = "A<think>BB</think>CCC";
    const tok = {
      apply_chat_template: () => rendered,
      encode: (t: string) => Array.from(t),
    };
    expect(countChatTokens(tok, [{ role: "user", content: "x" }])).toBe(1 + 1 + 2 + 1 + 3);
  });
});
