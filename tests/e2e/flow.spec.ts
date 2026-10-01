import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const MOCK = "/?mock=1#";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = ["rivers", "markets", "genes", "orbits", "recipes", "compilers", "glaciers", "poetry", "engines", "vaccines", "chess", "tides"];
const WORDS = "the of and to in is that it with as for was on are by this from be have or one had not but what all were when we there can an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know".split(" ");

/** Seeded English-looking chat data, big enough to unlock the larger sizes. */
function makeJsonl(rows: number, seed: number): string {
  const rnd = mulberry(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const sentence = (n: number, topic: string) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(i % 7 === 3 ? topic : pick(WORDS));
    return out.join(" ");
  };
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const topic = pick(TOPICS);
    const len = 20 + Math.floor(rnd() * 160);
    const user = `Question ${i}: ${sentence(8 + Math.floor(rnd() * 20), topic)}?`;
    const answer = `${sentence(len, topic)}. ${sentence(Math.floor(len / 2), topic)}.`;
    lines.push(JSON.stringify({ source: `src${i % 4}`, messages: [{ role: "user", content: user }, { role: "assistant", content: answer }] }));
  }
  return lines.join("\n") + "\n";
}

const BIG = makeJsonl(9000, 7);

async function upload(page: Page, content: string, name = "big.jsonl") {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/jsonl", buffer: Buffer.from(content) });
  await page.getByTestId("usable-line").waitFor({ timeout: 90_000 });
}

async function goalAndUpload(page: Page, goal: RegExp, content = BIG) {
  await page.goto(`${MOCK}/coach`);
  await page.reload();
  await page.getByRole("radio", { name: goal }).click();
  await upload(page, content);
}

async function biggestPreset(page: Page) {
  for (const name of [/Study scale/, /Standard/, /Quick test/]) {
    const b = page.getByRole("button", { name });
    if (await b.isEnabled()) {
      await b.click();
      return name.source;
    }
  }
  throw new Error("no preset enabled");
}

async function run(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click(); // data -> size
  await page.getByRole("button", { name: "Continue" }).click(); // size -> run
  await page.getByTestId("headline").waitFor({ timeout: 180_000 });
}

async function download(page: Page, click: () => Promise<void>): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  return readFileSync(await dl.path(), "utf8");
}

const headlineN = async (page: Page) => Number((await page.getByTestId("headline").innerText()).match(/([\d,]+)/)![1]!.replace(/,/g, ""));

test.describe.configure({ timeout: 240_000 });

test("large file: every size step works and the output is consistent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await goalAndUpload(page, /Reason through problems/);
  await page.getByRole("button", { name: "Continue" }).click();
  const which = await biggestPreset(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("headline").waitFor({ timeout: 180_000 });
  const n = await headlineN(page);
  expect(n, `preset ${which}`).toBeGreaterThan(50);

  const jsonl = await download(page, () => page.getByRole("button", { name: /^Download/ }).click());
  const lines = jsonl.trim().split("\n");
  expect(lines).toHaveLength(n);
  expect(new Set(lines).size).toBe(n);
  for (const l of lines) {
    const row = JSON.parse(l);
    expect(row.messages[0].role).toBe("user");
    expect(row.messages.at(-1).role).toBe("assistant");
  }

  await page.getByText("Advanced exports").click();
  for (const id of ["Random mix", "Cleanest first", "Clean + varied"]) {
    const row = page.locator("div", { hasText: id }).filter({ has: page.getByRole("button", { name: "Run summary (JSON)" }) }).last();
    const summary = JSON.parse(await download(page, () => row.getByRole("button", { name: "Run summary (JSON)" }).click()));
    expect(summary.actual_tokens, id).toBeLessThanOrEqual(summary.target_tokens);
    expect(Math.abs(summary.budget_error), id).toBeLessThan(summary.target_tokens * 0.02);
    const csv = await download(page, () => row.getByRole("button", { name: "Selection list (CSV)" }).click());
    expect(csv.trim().split("\n").length - 1, id).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test("same data and settings give the same file twice", async ({ page }) => {
  const once = async () => {
    await goalAndUpload(page, /Reason through problems/);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByTestId("headline").waitFor({ timeout: 180_000 });
    return download(page, () => page.getByRole("button", { name: /^Download/ }).click());
  };
  const a = await once();
  await page.reload();
  const b = await once();
  expect(b).toBe(a);
});

test("different random seed gives a different random pick", async ({ page }) => {
  const withSeed = async (seed: string) => {
    await goalAndUpload(page, /Follow instructions/);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByLabel("Random seed").fill(seed);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByTestId("headline").waitFor({ timeout: 180_000 });
    await page.getByText("Advanced exports").click();
    const row = page.locator("div", { hasText: "Random mix" }).filter({ has: page.getByRole("button", { name: "JSONL" }) }).last();
    return download(page, () => row.getByRole("button", { name: "JSONL" }).click());
  };
  const a = await withSeed("1");
  await page.reload();
  const b = await withSeed("2");
  expect(a).not.toBe(b);
});

test("three strategies pick different sets", async ({ page }) => {
  await goalAndUpload(page, /Reason through problems/);
  await run(page);
  await page.getByText("Advanced exports").click();
  const sets: string[] = [];
  for (const id of ["Random mix", "Cleanest first", "Clean + varied"]) {
    const row = page.locator("div", { hasText: id }).filter({ has: page.getByRole("button", { name: "JSONL" }) }).last();
    sets.push(await download(page, () => row.getByRole("button", { name: "JSONL" }).click()));
  }
  expect(new Set(sets).size).toBe(3);
});

test("all four goals reach a report with the study's label", async ({ page }) => {
  const small = makeJsonl(700, 3);
  const expected: [RegExp, string][] = [
    [/Follow instructions/, "No gain seen"],
    [/Reason through problems/, "Promising, not proven"],
    [/Solve math/, "Promising, not proven"],
    [/Not sure/, "Promising, not proven"],
  ];
  for (const [goal, label] of expected) {
    await goalAndUpload(page, goal, small);
    await run(page);
    await expect(page.getByText(label).first(), String(goal)).toBeVisible();
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByText("What do you want your model to get better at?")).toBeVisible();
  }
});

test("cancel during a run returns to the size step, then a new run works", async ({ page }) => {
  await goalAndUpload(page, /Reason through problems/);
  await page.getByRole("button", { name: "Continue" }).click();
  await biggestPreset(page);
  await page.getByRole("button", { name: "Continue" }).click();
  const cancel = page.getByRole("button", { name: "Cancel" });
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("headline").waitFor({ timeout: 180_000 });
});

test("back buttons keep the data; reload on the report restarts cleanly", async ({ page }) => {
  await goalAndUpload(page, /Not sure/, makeJsonl(700, 5));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByTestId("usable-line")).toBeVisible();
  await run(page);
  await page.reload();
  await expect(page.getByText("What do you want your model to get better at?")).toBeVisible();
});

test("other accepted formats: JSON array and prompt/response pairs", async ({ page }) => {
  const arr = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ messages: [{ role: "user", content: `Tell me fact number ${i} about rivers and tides please` }, { role: "assistant", content: `Fact ${i}: rivers carry water to the sea and tides move it back again each day.` }] })));
  await goalAndUpload(page, /Not sure/, arr);
  await expect(page.getByTestId("usable-line")).toContainText("usable");
  const pairs = Array.from({ length: 40 }, (_, i) => JSON.stringify({ prompt: `Explain item ${i} about engines and orbits`, response: `Item ${i}: engines burn fuel and orbits bend around a heavy mass.` })).join("\n");
  await goalAndUpload(page, /Not sure/, pairs);
  await expect(page.getByTestId("usable-line")).toContainText("usable");
});

test("data stays in the browser: only same-origin requests, no uploads", async ({ page }) => {
  const reqs: { url: string; method: string }[] = [];
  page.on("request", (r) => reqs.push({ url: r.url(), method: r.method() }));
  await goalAndUpload(page, /Not sure/, makeJsonl(700, 9));
  await run(page);
  await download(page, () => page.getByRole("button", { name: /^Download/ }).click());
  const origin = new URL(page.url()).origin;
  const outside = reqs.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith("blob:") && !r.url.startsWith("data:"));
  expect(outside).toEqual([]);
  expect(reqs.filter((r) => r.method !== "GET" && r.method !== "HEAD")).toEqual([]);
});

test("messy rows are skipped with reasons, not crashes", async ({ page }) => {
  const good = makeJsonl(60, 11).trim().split("\n");
  const bad = ["not json", '{"messages":[]}', '{"messages":[{"role":"user","content":"only a question"}]}', '{"messages":[{"role":"user","content":""},{"role":"assistant","content":""}]}', good[0]!];
  await goalAndUpload(page, /Not sure/, [...good, ...bad].join("\n"));
  await expect(page.getByTestId("usable-line")).toContainText(/skipped/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("headline").waitFor({ timeout: 60_000 });
});
