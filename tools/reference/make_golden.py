"""Generate golden vectors by running the paper's UNMODIFIED select_data.py.

Usage:  python3 tools/reference/make_golden.py

Outputs (all committed; the JS test-suite only reads them):
  tests/golden/meta.json        provenance (sha256 of select_data.py, versions)
  tests/golden/rows.json        synthetic input rows, grouped by source
  tests/golden/functions.json   per-function golden vectors
  tests/golden/shuffle.json     random.Random(seed).shuffle vectors
  tests/golden/scenarios.json   full main() runs (random/quality/diversity)
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import platform
import random
import string
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "tests" / "golden"
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

import stubs  # noqa: E402

stubs.install()
import select_data as sd  # noqa: E402  (the paper's file, unmodified)

SOURCES = list(sd.CONFIGS)
FUNC_WORDS = ["the", "a", "an", "and", "of", "to", "in", "is", "for", "with", "how", "what", "why", "please", "from", "are"]

# rough token bins for the stub token function: tokens = 11 + 6*words (two messages)
BIN_WORD_RANGES = [(6, 38), (42, 84), (86, 168), (172, 254), (258, 338), (350, 420)]
BIN_WEIGHTS = {
    "smol-magpie-ultra": [0.02, 0.05, 0.20, 0.35, 0.33, 0.05],
    "smol-constraints": [0.70, 0.20, 0.07, 0.01, 0.00, 0.02],
    "smol-rewrite": [0.30, 0.50, 0.15, 0.00, 0.00, 0.05],
    "smol-summarize": [0.30, 0.30, 0.15, 0.15, 0.08, 0.02],
}
ROW_COUNTS = {"smol-magpie-ultra": 600, "smol-constraints": 400, "smol-rewrite": 350, "smol-summarize": 450}


def build_vocab(rng: random.Random, n: int = 240) -> list[str]:
    words = []
    for _ in range(n):
        length = rng.randint(3, 9)
        words.append("".join(rng.choice(string.ascii_lowercase) for _ in range(length)))
    return words


def sentence(rng: random.Random, vocab: list[str], count: int) -> str:
    parts = []
    for i in range(count):
        word = rng.choice(FUNC_WORDS) if rng.random() < 0.33 else rng.choice(vocab)
        if i % 11 == 10:
            word += rng.choice([",", ".", ";", "?"])
        parts.append(word)
    return " ".join(parts)


def weird_whitespace(rng: random.Random, text: str) -> str:
    seps = ["\n", "\t", "\x1c", " ", "　", " ", "\x85", "﻿", "  ", "\r\n"]
    words = text.split(" ")
    return "".join(w + (rng.choice(seps) if i < len(words) - 1 else "") for i, w in enumerate(words))


def make_messages(rng: random.Random, vocab: list[str], total_words: int) -> list[dict]:
    user_words = max(1, int(total_words * rng.uniform(0.25, 0.5)))
    assistant_words = max(1, total_words - user_words)
    messages = [
        {"role": "user", "content": sentence(rng, vocab, user_words)},
        {"role": "assistant", "content": sentence(rng, vocab, assistant_words)},
    ]
    if rng.random() < 0.15:
        messages.insert(0, {"role": "system", "content": sentence(rng, vocab, rng.randint(3, 12))})
    if rng.random() < 0.15 and total_words > 30:
        messages.append({"role": "user", "content": sentence(rng, vocab, rng.randint(3, 10))})
        messages.append({"role": "assistant", "content": sentence(rng, vocab, rng.randint(3, 20))})
    return messages


UNICODE_SNIPPETS = [
    "café naïve façade",
    "é combining marks ä",
    "İstanbul K elvin",
    "٣٤ digits Ⅷ roman ² sup",
    "emoji \U0001F600 test \U0001F468‍\U0001F469‍\U0001F467",
    "中文文本 CJK 日本語",
    "under_score_word snake_case",
    "tab\tinside and line sep",
]


def add_defects(rng: random.Random, source: str, rows: list[dict], vocab: list[str]) -> None:
    """Mutate a fraction of rows to exercise filters."""
    for row in rows:
        roll = rng.random()
        msgs = row["messages"]
        if roll < 0.03:  # Korean
            msgs[-1]["content"] = "안녕하세요 이것은 한국어 문장입니다 " * rng.randint(1, 8)
        elif roll < 0.06:  # very short assistant answer
            msgs[-1]["content"] = sentence(rng, vocab, rng.randint(1, 6))
        elif roll < 0.075:  # repeated character run of 9..14
            n = rng.randint(9, 14)
            msgs[-1]["content"] += " x" + ("z" * n) + " tail"
        elif roll < 0.08:  # NUL
            msgs[-1]["content"] += " nul\x00byte here"
        elif roll < 0.10:  # heavy word repetition
            w = rng.choice(vocab)
            msgs[-1]["content"] = " ".join([w] * rng.randint(20, 60)) + " " + msgs[-1]["content"]
        elif roll < 0.12:  # odd whitespace
            msgs[-1]["content"] = weird_whitespace(rng, msgs[-1]["content"])
            msgs[0]["content"] = "  " + msgs[0]["content"] + "\n\n"
        elif roll < 0.14:  # unicode
            msgs[-1]["content"] += " " + rng.choice(UNICODE_SNIPPETS)
        elif roll < 0.15:  # digits / punctuation heavy
            msgs[-1]["content"] = " ".join(str(rng.randint(0, 99999)) for _ in range(rng.randint(10, 40)))


MALFORMED = [
    lambda rng: None,
    lambda rng: "not a list",
    lambda rng: {"role": "user", "content": "dict not list"},
    lambda rng: [{"role": "user", "content": "only user turn here please"}],
    lambda rng: [{"role": "assistant", "content": "only assistant turn here please"}],
    lambda rng: [{"role": "tool", "content": "x"}, {"role": "assistant", "content": "y"}],
    lambda rng: [{"role": "user", "content": 5}, {"role": "assistant", "content": "y"}],
    lambda rng: [{"role": "user", "content": "   \n\t "}, {"role": "assistant", "content": "y"}],
    lambda rng: ["oops", {"role": "assistant", "content": "y"}],
    lambda rng: [{"content": "no role"}, {"role": "assistant", "content": "y"}],
    lambda rng: [{"role": " User ", "content": "spaces and case in role are tolerated here"}, {"role": "ASSISTANT", "content": "so this should pass the canonical stage"}],
    lambda rng: [],
]


def synth_rows() -> dict[str, list[dict]]:
    rng = random.Random(20260930)
    vocab = build_vocab(rng)
    data: dict[str, list[dict]] = {}
    seen_messages: list[list[dict]] = []
    for source in SOURCES:
        rows: list[dict] = []
        weights = BIN_WEIGHTS[source]
        for _ in range(ROW_COUNTS[source]):
            bin_index = rng.choices(range(len(weights)), weights=weights)[0]
            lo, hi = BIN_WORD_RANGES[bin_index]
            rows.append({"messages": make_messages(rng, vocab, rng.randint(lo, hi))})
        add_defects(rng, source, rows, vocab)
        # malformed rows
        for index in rng.sample(range(len(rows)), 14):
            rows[index] = {"messages": rng.choice(MALFORMED)(rng)}
        # duplicates (within source and across sources)
        for index in rng.sample(range(len(rows)), 10):
            if seen_messages and rng.random() < 0.5:
                rows[index] = {"messages": json.loads(json.dumps(rng.choice(seen_messages)))}
            else:
                other = rng.randrange(len(rows))
                rows[index] = {"messages": json.loads(json.dumps(rows[other]["messages"]))}
        for row in rows:
            if isinstance(row["messages"], list):
                seen_messages.append(row["messages"])
        data[source] = rows
    return data


EDGE_MESSAGES = [
    [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "ok"}],
    [{"role": "user", "content": "What is the capital of France? Please answer in one word."}, {"role": "assistant", "content": "The capital of France is Paris, a city on the Seine river."}],
    [{"role": "user", "content": "a" * 40}, {"role": "assistant", "content": "b" * 40}],
    [{"role": "user", "content": "aaaaaaaaa is nine"}, {"role": "assistant", "content": "the answer is here for the user"}],
    [{"role": "user", "content": "aaaaaaaaaa is ten"}, {"role": "assistant", "content": "the answer is here for the user"}],
    [{"role": "user", "content": "xxxxxxxxxxxx twelve"}, {"role": "assistant", "content": "the answer is here for the user"}],
    [{"role": "user", "content": "xxxxxxxxxxxxx thirteen"}, {"role": "assistant", "content": "the answer is here for the user"}],
    [{"role": "user", "content": "x\x1cy z"}, {"role": "assistant", "content": "the\x85answer is﻿fine for the user today"}],
    [{"role": "user", "content": "안녕하세요 hello there how are you"}, {"role": "assistant", "content": "좋아요 the weather is fine today in the city"}],
    [{"role": "user", "content": "\U0001F600 " * 30}, {"role": "assistant", "content": "the the the the the the the the the the the the"}],
    [{"role": "user", "content": "café é́ İ K K"}, {"role": "assistant", "content": "in the of to a for from how why what please are is with an and"}],
    [{"role": "user", "content": "digits ٣٤٥ Ⅷ ² _under"}, {"role": "assistant", "content": "word1 word_2 ²³ ٣٤ and the rest are fine"}],
    [{"role": "user", "content": "line\nbreak\tand\r\nmore"}, {"role": "assistant", "content": "\n\nleading and trailing\n\n"}],
    [{"role": "system", "content": "you are helpful"}, {"role": "user", "content": "hello there my friend"}, {"role": "assistant", "content": "hello to you too my dear friend of mine"}],
    [{"role": "user", "content": "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 a b c d"}, {"role": "assistant", "content": "26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 with the"}],
]


def sha_id(messages: list[dict]) -> str:
    return hashlib.sha256(json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def record(example_id: str, tokens: int, quality: float = 0.0, source: str = "s", row: int = 0, bin_label: str = "0-255") -> "sd.Record":
    return sd.Record(example_id=example_id, source=source, source_row=row, length_bin=bin_label, token_count=tokens, quality_score=quality, text="", messages=[])


def function_goldens(rows_by_source: dict[str, list[dict]]) -> dict:
    rng = random.Random(777)
    out: dict = {}

    # canonical_messages / example id / token count / hard_valid / text_quality per input row
    per_row = []
    for source in SOURCES:
        for index, row in enumerate(rows_by_source[source]):
            canon = sd.canonical_messages(row.get("messages"))
            if canon is None:
                per_row.append({"source": source, "row": index, "canonical": None})
                continue
            tokens = stubs.stub_token_count(canon)
            per_row.append(
                {
                    "source": source,
                    "row": index,
                    "canonical": canon,
                    "id": sha_id(canon),
                    "tokens": tokens,
                    "bin": sd.length_bin(tokens) if 0 < tokens < 2049 else None,
                    "valid": sd.hard_valid(canon, tokens, 2048),
                    "quality": sd.text_quality(canon, tokens),
                }
            )
    out["per_row"] = per_row

    # edge rows go through canonical_messages as raw input
    edge = []
    for raw in EDGE_MESSAGES:
        canon = sd.canonical_messages(raw)
        tokens = stubs.stub_token_count(canon)
        edge.append(
            {
                "raw": raw,
                "canonical": canon,
                "id": sha_id(canon),
                "tokens": tokens,
                "valid": sd.hard_valid(canon, tokens, 2048),
                "quality": sd.text_quality(canon, tokens),
                "quality_short_len": sd.text_quality(canon, 10),
                "quality_long_len": sd.text_quality(canon, 1600),
            }
        )
    out["edge"] = edge

    # canonical_messages on raw malformed values
    raws = [
        None, "x", 5, {}, [], [1], [{"role": "user", "content": "a"}],
        [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}],
        [{"role": "USER", "content": " a  b "}, {"role": " assistant", "content": "c\n\nd"}],
        [{"role": "user", "content": "a"}, {"role": "assistant"}],
        [{"role": "user", "content": None}, {"role": "assistant", "content": "b"}],
        [{"role": "user", "content": "a"}, {"role": "assistant", "content": "  "}],
        [{"role": "user", "content": "a"}, {"role": "system", "content": "s"}, {"role": "assistant", "content": "b"}],
        [{"role": "user", "content": " a　b c"}, {"role": "assistant", "content": "z"}],
    ]
    out["canonical_raw"] = [{"raw": raw, "canonical": sd.canonical_messages(raw)} for raw in raws]

    # length_bin boundaries
    out["length_bin"] = [{"tokens": t, "bin": sd.length_bin(t)} for t in [1, 255, 256, 257, 511, 512, 513, 1023, 1024, 1025, 1535, 1536, 1537, 2047, 2048]]

    # stable_int
    strings = []
    for i in range(120):
        strings.append(f"{rng.choice([0, 7, 13, 42, 2026])}:{hashlib.sha256(str(i).encode()).hexdigest()}")
    strings += ["", "a", "é", "0:abc", "안녕"]
    out["stable_int"] = [{"value": s, "int": str(sd.stable_int(s))} for s in strings]

    # token_quotas
    cases = []
    for _ in range(40):
        n = rng.randint(1, 18)
        strata = {f"src{rng.randint(0, 3)}|{rng.randint(0, 4)}-{i}": rng.randint(1, 500000) for i in range(n)}
        target = rng.choice([1, 7, 999, 100000, 1000000, rng.randint(1, 3000000)])
        cases.append({"stratum_tokens": strata, "target": target, "quotas": sd.token_quotas(strata, target)})
    cases.append({"stratum_tokens": {}, "target": 100, "quotas": sd.token_quotas({}, 100)})
    out["token_quotas"] = cases

    # random_order
    cases = []
    for _ in range(12):
        n = rng.randint(0, 60)
        ids = [hashlib.sha256(f"r{rng.random()}".encode()).hexdigest() for _ in range(n)]
        recs = [record(i, 10) for i in ids]
        for seed in (13, 42, 2026):
            cases.append({"ids": ids, "seed": seed, "order": [r.example_id for r in sd.random_order(recs, seed)]})
    out["random_order"] = cases

    # quality_order
    cases = []
    for _ in range(15):
        n = rng.randint(0, 50)
        items = []
        for i in range(n):
            items.append({"id": hashlib.sha256(f"q{rng.random()}".encode()).hexdigest(), "quality": round(rng.uniform(0.3, 1.0), 2)})
        floor = rng.choice([0.0, 0.55, 0.7, 0.9])
        recs = [record(x["id"], 10, x["quality"]) for x in items]
        cases.append({"items": items, "floor": floor, "order": [r.example_id for r in sd.quality_order(recs, floor)]})
    out["quality_order"] = cases

    # take_under_budget
    cases = []
    for _ in range(40):
        n = rng.randint(0, 40)
        items = [{"id": f"t{i}-{rng.randint(0, 10**6)}", "tokens": rng.randint(5, 300)} for i in range(n)]
        budget = rng.choice([0, 1, 50, 300, 1000, rng.randint(1, 6000)])
        recs = [record(x["id"], x["tokens"]) for x in items]
        chosen, total = sd.take_under_budget(recs, budget)
        cases.append({"items": items, "budget": budget, "chosen": [r.example_id for r in chosen], "total": total})
    out["take_under_budget"] = cases

    # find_subset_sum
    cases = []
    for _ in range(45):
        n = rng.randint(0, 70)
        items = [{"id": f"f{i}-{rng.randint(0, 10**6)}", "tokens": rng.randint(1, 300)} for i in range(n)]
        target = rng.choice([0, 1, 17, 250, 999, rng.randint(1, 2500)])
        recs = [record(x["id"], x["tokens"]) for x in items]
        result = sd.find_subset_sum(recs, target)
        cases.append({"items": items, "target": target, "result": None if result is None else [r.example_id for r in result]})
    out["find_subset_sum"] = cases

    # fit_exact_budget
    cases = []
    for _ in range(45):
        n = rng.randint(3, 80)
        items = [{"id": f"x{i}-{rng.randint(0, 10**6)}", "tokens": rng.randint(3, 250)} for i in range(n)]
        recs = [record(x["id"], x["tokens"]) for x in items]
        k = rng.randint(1, n - 1)
        chosen_idx = sorted(rng.sample(range(n), k))
        selected = [recs[i] for i in chosen_idx]
        current = sum(r.token_count for r in selected)
        target = rng.choice([current, current + rng.randint(1, 60), current + rng.randint(1, 400), max(1, current - rng.randint(1, 50))])
        result = sd.fit_exact_budget(selected, recs, target)
        cases.append(
            {
                "items": items,
                "selected": [items[i]["id"] for i in chosen_idx],
                "target": target,
                "result": [r.example_id for r in result],
            }
        )
    out["fit_exact_budget"] = cases

    # diversity_order (stub embedder + stub kmeans)
    embedder = stubs._SentenceTransformer()
    cases = []
    for _ in range(25):
        n = rng.randint(0, 90)
        items = []
        for i in range(n):
            text = " ".join(rng.choice(FUNC_WORDS + ["alpha", "beta", "gamma", "delta", "omega"]) for _ in range(rng.randint(1, 12)))
            items.append({"id": hashlib.sha256(f"d{rng.random()}".encode()).hexdigest(), "quality": round(rng.uniform(0.3, 1.0), 2), "text": text})
        floor = rng.choice([0.0, 0.55, 0.8])
        seed = rng.choice([13, 42, 2026, 5])
        recs = []
        for x in items:
            r = record(x["id"], 10, x["quality"])
            recs.append(sd.Record(**{**r.__dict__, "text": x["text"]}))
        order = sd.diversity_order(recs, floor, seed, embedder)
        cases.append({"items": items, "floor": floor, "seed": seed, "order": [r.example_id for r in order]})
    out["diversity_order"] = cases
    return out


def shuffle_goldens() -> dict:
    seeds = [0, 1, 13, 42, 2026, 2**31, 2**32 - 1, 2**32, 2**40, 2**33 + 5, 2**64 + 3, 123456789012345678901234567890]
    sizes = [0, 1, 2, 3, 5, 10, 31, 32, 33, 100, 257, 1000]
    cases = []
    for seed in seeds:
        for n in sizes:
            values = list(range(n))
            random.Random(seed).shuffle(values)
            cases.append({"seed": str(seed), "n": n, "order": values})
    return {"python": platform.python_version(), "cases": cases}


def pool_snapshot(pool) -> dict:
    candidates, stratum_counts, stratum_tokens, source_rows = pool
    return {
        "candidates": {
            stratum: [[r.source, r.source_row, r.example_id, r.token_count, r.quality_score] for r in records]
            for stratum, records in sorted(candidates.items())
        },
        "stratum_counts": dict(sorted(stratum_counts.items())),
        "stratum_tokens": dict(sorted(stratum_tokens.items())),
        "source_rows": source_rows,
    }


def run_main(argv: list[str]) -> None:
    old = sys.argv
    sys.argv = ["select_data.py"] + argv
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            sd.main()
    finally:
        sys.argv = old


def scenario_goldens() -> list[dict]:
    scenarios = []
    pool_cache: dict[tuple[int, int], dict] = {}
    plans = [
        # name, cap, pool_seed, target (fraction of capped candidate tokens, or absolute), floor, seeds
        ("cap60-40pct", 60, 0, ("frac", 0.40), 0.55, [13, 42, 2026]),
        ("cap60-90pct", 60, 0, ("frac", 0.90), 0.55, [13, 42]),
        ("cap250-25pct", 250, 0, ("frac", 0.25), 0.55, [13, 42]),
        ("cap60-tiny", 60, 0, ("abs", 3000), 0.55, [13, 42]),
        ("cap60-over", 60, 0, ("frac", 1.20), 0.55, [13]),
        ("cap100-50pct-floor75-poolseed7", 100, 7, ("frac", 0.50), 0.75, [13, 42]),
    ]
    tokenizer = stubs._StubTokenizer()
    for name, cap, pool_seed, target_spec, floor, seeds in plans:
        args = argparse.Namespace(
            max_rows_per_config=0, tokenize_batch_size=128, max_length=2048, pool_seed=pool_seed,
            candidate_cap_per_stratum=cap, seed=pool_seed,
        )
        key = (cap, pool_seed)
        pool = sd.load_pool(args, tokenizer)
        if key not in pool_cache:
            pool_cache[key] = pool_snapshot(pool)
        candidate_tokens = sum(r.token_count for records in pool[0].values() for r in records)
        target = int(candidate_tokens * target_spec[1]) if target_spec[0] == "frac" else int(target_spec[1])
        runs = {}
        with tempfile.TemporaryDirectory() as tmp:
            run_main(
                [
                    "--seeds", *[str(s) for s in seeds],
                    "--pool-seed", str(pool_seed),
                    "--target-tokens", str(target),
                    "--max-rows-per-config", "0",
                    "--candidate-cap-per-stratum", str(cap),
                    "--quality-floor", str(floor),
                    "--out-dir", tmp,
                ]
            )
            for seed in seeds:
                for strategy in ("random", "quality", "diversity"):
                    stem = Path(tmp) / f"manifest_{strategy}_seed{seed}"
                    lines = (stem.with_suffix(".csv")).read_text(encoding="utf-8").splitlines()[1:]
                    picked = []
                    for line in lines:
                        example_id, source, source_row, _bin, tokens, _quality = line.split(",")
                        picked.append(f"{source}|{source_row}|{tokens}|{example_id[:10]}")
                    summary = json.loads(Path(str(stem) + ".summary.json").read_text(encoding="utf-8"))
                    runs[f"{strategy}-{seed}"] = {"picked": picked, "summary": summary}
        scenarios.append(
            {
                "name": name,
                "config": {"cap": cap, "poolSeed": pool_seed, "target": target, "floor": floor, "seeds": seeds},
                "candidate_tokens": candidate_tokens,
                "pool_key": f"cap{cap}-ps{pool_seed}",
                "runs": runs,
            }
        )
    return [{"pools": {f"cap{k[0]}-ps{k[1]}": v for k, v in pool_cache.items()}}] + scenarios


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows_by_source = synth_rows()
    stubs.SYNTH_DATA.update(rows_by_source)

    meta = {
        "select_data_sha256": hashlib.sha256((HERE / "select_data.py").read_bytes()).hexdigest(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "note": "Generated by tools/reference/make_golden.py running the unmodified select_data.py with stubs from stubs.py.",
        "row_counts": {s: len(rows_by_source[s]) for s in SOURCES},
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "rows.json").write_text(json.dumps(rows_by_source, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "functions.json").write_text(json.dumps(function_goldens(rows_by_source), ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "shuffle.json").write_text(json.dumps(shuffle_goldens()) + "\n", encoding="utf-8")
    (OUT / "scenarios.json").write_text(json.dumps(scenario_goldens(), ensure_ascii=False) + "\n", encoding="utf-8")
    for name in ("meta", "rows", "functions", "shuffle", "scenarios"):
        print(f"{name}.json", (OUT / f"{name}.json").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
