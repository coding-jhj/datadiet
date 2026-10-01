// Run on YOUR PC (needs internet): npx tsx tools/verify/check_real_models.mjs
// 1) real Qwen tokenizer in transformers.js vs the Python golden (run gen_token_golden.py first)
// 2) MiniLM embeddings: sanity (norm=1, similar > dissimilar)
import { readFileSync, existsSync } from "node:fs";
import { AutoTokenizer, pipeline } from "@huggingface/transformers";
import { countChatTokens } from "../../src/ml/tokenizer.ts";

const tok = await AutoTokenizer.from_pretrained("Qwen/Qwen3-1.7B-Base", { revision: "ea980cb0a6c2ae4b936e82123acc929f1cec04c1" });
if (existsSync("tests/golden/token_real.json")) {
  const gold = JSON.parse(readFileSync("tests/golden/token_real.json", "utf8"));
  for (const g of gold) {
    const n = countChatTokens(tok, g.messages);
    console.log(n === g.tokens ? "PASS" : "FAIL", "tokens js=" + n, "py=" + g.tokens);
  }
} else console.log("SKIP token golden: run tools/verify/gen_token_golden.py first");

const ex = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
const t = await ex(["How do I train a model?", "How can I fine-tune a model?", "Best pasta recipe"], { pooling: "mean", normalize: true });
const d = t.dims[1], v = (i) => Array.from(t.data.slice(i * d, (i + 1) * d));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
console.log("norm", dot(v(0), v(0)).toFixed(4), "sim(similar)", dot(v(0), v(1)).toFixed(3), "sim(diff)", dot(v(0), v(2)).toFixed(3));
console.log(dot(v(0), v(1)) > dot(v(0), v(2)) ? "PASS embed sanity" : "FAIL embed sanity");
