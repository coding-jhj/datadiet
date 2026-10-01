import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const MOCK = "/?mock=1#";

async function sampleToReport(page: Page, goal: RegExp) {
  await page.goto(`${MOCK}/`);
  await page.getByRole("button", { name: /Try a sample/ }).click();
  await page.getByRole("radio", { name: goal }).click();
  await page.getByTestId("usable-line").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("headline").waitFor({ timeout: 60_000 });
}

test("landing states the paper title and who the app helps (C03)", async ({ page }) => {
  await page.goto(`${MOCK}/`);
  await expect(page.getByText("Effects of Data Selection under a Fixed Token Budget").first()).toBeVisible();
  await expect(page.getByTestId("helps-sentence")).toContainText("helps people fine-tuning a small AI model choose which training examples");
});

test("three user tasks: goal, data, download", async ({ page }) => {
  await sampleToReport(page, /Reason through problems/);
  await expect(page.getByText("Promising, not proven")).toBeVisible();
  const n = Number((await page.getByTestId("headline").innerText()).match(/([\d,]+)/)![1]!.replace(/,/g, ""));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download/ }).click()]);
  const text = readFileSync(await dl.path(), "utf8").trim().split("\n");
  expect(text).toHaveLength(n);
  for (const line of text) expect(JSON.parse(line).messages.length).toBeGreaterThanOrEqual(2);
});

test("instruction goal gets the honest 'no gain' answer", async ({ page }) => {
  await sampleToReport(page, /Follow instructions/);
  await expect(page.getByText("No gain seen").first()).toBeVisible();
  await expect(page.getByText("Our reading")).toBeVisible();
});

const BAD: [string, string, RegExp][] = [
  ["empty file", "", /Drop a \.jsonl file/],
  ["plain prose", "hello this is not json at all", /didn't look like JSONL/],
  ["wrong shape", '{"foo":1}\n{"bar":2}', /didn't look like JSONL/],
  ["binary junk", "\u0000\u0001\u0002{{{[[[", /didn't look like JSONL/],
];
for (const [name, content, expected] of BAD) {
  test(`bad input does not crash: ${name}`, async ({ page }) => {
    await page.goto(`${MOCK}/coach`);
    await page.getByRole("radio", { name: /Not sure/ }).click();
    await page.getByText("Paste text instead").click();
    if (content) {
      await page.getByLabel("Paste JSONL here").fill(content);
      await page.getByRole("button", { name: "Use pasted text" }).click();
      await expect(page.getByText(expected).first()).toBeVisible();
    } else {
      await expect(page.getByText(expected).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
}

test("non-English data shows the English-only banner", async ({ page }) => {
  const row = JSON.stringify({ messages: [{ role: "user", content: "안녕하세요 오늘 날씨가 어떤가요 알려주세요" }, { role: "assistant", content: "오늘은 맑고 따뜻합니다 나들이 가기 좋은 날씨입니다" }] });
  await page.goto(`${MOCK}/coach`);
  await page.getByRole("radio", { name: /Not sure/ }).click();
  await page.getByText("Paste text instead").click();
  await page.getByLabel("Paste JSONL here").fill([row, row.replace("오늘 날씨", "내일 날씨")].join("\n"));
  await page.getByRole("button", { name: "Use pasted text" }).click();
  await expect(page.getByText("This app checks English data only.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("results page without a run redirects to the start", async ({ page }) => {
  await page.goto(`${MOCK}/report`);
  await expect(page.getByText("What do you want your model to get better at?")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: no serious violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const path of ["/", "/evidence", "/how-it-works", "/about", "/coach"]) {
      await page.goto(`${MOCK}${path}`);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), path).toEqual([]);
    }
    await sampleToReport(page, /Reason through problems/);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), "report").toEqual([]);
  });
}

test("mobile width has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/", "/evidence", "/how-it-works", "/coach"]) {
    await page.goto(`${MOCK}${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await sampleToReport(page, /Reason through problems/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
