"""Run on YOUR PC (needs internet): pip install transformers. Writes tests/golden/token_real.json"""
import json
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-1.7B-Base", revision="ea980cb0a6c2ae4b936e82123acc929f1cec04c1")
samples = [
    [{"role": "user", "content": "What is 2+2?"}, {"role": "assistant", "content": "It is 4."}],
    [{"role": "system", "content": "Be brief."}, {"role": "user", "content": "Explain gradient descent in one sentence."}, {"role": "assistant", "content": "It repeatedly nudges parameters downhill on the loss surface."}],
    [{"role": "user", "content": "Rewrite: the cat sat on the mat"}, {"role": "assistant", "content": "The cat was sitting on the mat.\n\nDone."}],
]
out = []
for m in samples:
    r = tok.apply_chat_template(m, tokenize=True, add_generation_prompt=False)
    ids = r["input_ids"] if hasattr(r, "keys") else r
    out.append({"messages": m, "tokens": len(ids)})
json.dump(out, open("tests/golden/token_real.json", "w"), indent=1)
print(out and [o["tokens"] for o in out])
