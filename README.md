# DataDiet

**This app helps people fine-tuning a small AI model choose which training examples to use when they can only afford a limited amount of training, based on a controlled study of three selection strategies.**

Based on the paper *Effects of Data Selection under a Fixed Token Budget* (Korean manuscript in `public/paper/paper.pdf`, study package in `data/paper/`).

Your data never leaves your browser. No account, no API key, no environment variable is needed.

## What you do (three tasks)

1. **Pick your goal**: follow instructions, reason through problems, solve math word problems, or not sure.
2. **Bring your examples**: drop a `.jsonl` file (one `{"messages":[{"role":"user",...},{"role":"assistant",...}]}` per line) or press *Try a sample*. A data health check appears at once.
3. **Get your pick**: choose a training size, then compare *Random mix*, *Cleanest first* and *Clean + varied* on the same budget, read what the study says about your goal, and download a ready training file.

## Run it

**Public URL:** see the link on the portfolio site (static site, no login).

**From the ZIP** (prebuilt, needs only Python or Node):

```bash
unzip datadiet-submission.zip && cd datadiet/dist && python3 -m http.server 8080
# or: npx serve dist
```

Open <http://localhost:8080>. (Opening `index.html` by double-click does not work: browsers block module workers on `file://`.)

**From source:**

```bash
npm install --ignore-scripts
npm run dev        # development
npm run build      # production build into dist/
npm test           # unit, parity and evidence tests
npm run e2e        # browser tests (needs Chromium; set CHROMIUM_PATH if not auto-found)
```

## Quick check (about 2 minutes)

| Step | Do this | You should see |
|---|---|---|
| 1 | Open the app, read the first screen | The paper title and the one-sentence "This app helps people fine-tuning…" |
| 2 | *Try a sample (60 seconds)* → choose **Reason through problems** | A health card: "We found N usable examples. M were skipped." with reasons |
| 3 | Continue twice (default size) | A report card: "We picked N examples for you." with a "Promising, not proven" label and three strategy cards |
| 4 | Press *Download …* | A `.jsonl` file whose line count equals N |
| 5 | Start over, choose **Follow instructions**, repeat | The label is "No gain seen" (the study found no difference for this goal) |
| 6 | Paste `hello` under *Paste text instead* | A friendly message, no crash |

The *Clean + varied* strategy downloads a small public model (about 25 MB) on first use. If it cannot be downloaded, the app says so and still shows the other two strategies.

## How the paper's results are used

* `src/evidence/evidence.generated.json` is built by `npm run evidence` from the study's CSV/JSON files in `data/paper/` (checksums recorded). Every number shown comes from it.
* The recommendation and the confidence label (*No gain seen / Promising, not proven / Unclear*) are computed from the paper's confidence intervals in `src/evidence/recommend.ts`.
* The three selection strategies are a TypeScript port of the study's `select_data.py`. `tests/engine` checks that random and cleanest-first picks are **identical** to the original Python on golden vectors, and that the varied strategy matches when the topic groups are fixed. Topic grouping itself (k-means) is an approximation, tested statistically.

Differences from the study are listed on the *How it works* page (for example: the quality cutoff is applied as in the study's code, not as its text says; extra whitespace is kept unless you switch it off; token counts are estimates if the exact tokenizer cannot load).

## Data

* `public/sample/smoltalk-sample.jsonl` is a small demo file. Regenerate a real one on your own machine:
  `pip install datasets && python tools/sample/make_sample.py --mode real --out public/sample/smoltalk-sample.jsonl`
  (streams the pinned SmolTalk revision, Apache-2.0 subsets, and adds a few synthetic "problem" rows for the health check).
* No personal data is included. See `NOTICE` for sources and licenses.

## Repository map

```
src/engine     selection engine (port of select_data.py)
src/ml         tokenizer, embedder, k-means
src/workers    background worker (Comlink)
src/evidence   paper numbers, recommendation rules
src/pages      screens
tests/         unit, golden-parity, property, e2e
tools/         golden generator (Python), evidence builder, sample builder, packager
data/paper     vendored study package (read-only)
```
