// The three real-world cases (see CLAUDE.md 7.4). Fixtures are local only: run scripts/prepare-fixtures.sh first.
import {test, expect} from "@playwright/test";
import fs from "fs";

const FX = "tests/fixtures/local";
const need = (...files) => test.skip(!files.every(f => fs.existsSync(`${FX}/${f}`)), `missing fixtures in ${FX} (scripts/prepare-fixtures.sh)`);
const shot = async (page, info, name) => {
  fs.mkdirSync("screenshots", {recursive: true});
  await page.screenshot({path: `screenshots/${info.project.name}-${name}.png`, fullPage: true});
};

async function analyze(page, exercise, file, reference = "Built-in animation") {
  await page.locator("#trainEx button", {hasText: exercise}).first().click();
  await page.locator("#tplSel").selectOption({label: reference});
  await page.locator("#userFile").setInputFiles(`${FX}/${file}`);
  const cue = page.locator("#cue");
  await expect(cue).toHaveText(/reps? found|No complete|can't/, {timeout: 240_000});
  await page.waitForTimeout(1200); // replay seeks to the weakest rep
  const text = await cue.textContent();
  expect(text, text).toMatch(/reps? found/);
  return {
    cue: text,
    reps: +await page.locator("#reps").textContent(),
    score: +await page.locator("#last").textContent(),
    tips: (await page.locator("#tips li").allTextContents()).join(" | "),
    meters: Object.fromEntries((await page.locator("#meters .meter").all()).length ? await page.locator("#meters .meter").evaluateAll(ms => ms.map(m => [m.firstElementChild.textContent, +m.lastElementChild.textContent])) : []),
  };
}

test.describe("real videos", () => {
  test.setTimeout(300_000);
  test.beforeEach(async ({page}, info) => {
    info.errors = [];
    page.on("pageerror", e => info.errors.push(e.message));
    await page.goto("./");
  });
  test.afterEach(async ({}, info) => expect(info.errors).toEqual([]));

  test("case 1: good bicep curl (side view) scores high with nothing to fix", async ({page}, info) => {
    need("curl_good.webm");
    const r = await analyze(page, "Bicep curl", "curl_good.webm");
    await shot(page, info, "case1-curl-good");
    expect(r.reps).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.tips).toMatch(/match the reference well/);
    expect(r.meters["Upper-arm swing"]).toBeGreaterThanOrEqual(90);
    await expect(page.locator("#replayBar")).toBeVisible();
  });

  test("case 2: bad bicep curl (elbow swings forward) is caught", async ({page}, info) => {
    need("curl_bad.webm");
    const r = await analyze(page, "Bicep curl", "curl_bad.webm");
    await shot(page, info, "case2-curl-bad");
    expect(r.reps).toBe(1);
    expect(r.score).toBeLessThanOrEqual(85);
    expect(r.meters["Upper-arm swing"]).toBeLessThan(80);
    expect(r.tips).toMatch(/upper-arm swing is \d+° larger than the reference\. Pin your elbow to your side/);
  });

  test("case 3: squat from a YouTube screen recording (small, angled, two people)", async ({page}, info) => {
    need("squat_youtube.webm");
    const r = await analyze(page, "Squat", "squat_youtube.webm");
    await shot(page, info, "case3-squat");
    expect(r.reps).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.cue).toMatch(/Angled view: measured in 3D/);
    expect(r.cue).toMatch(/Tracking the person doing the reps/);
    expect(r.meters["Knee angle"]).toBeGreaterThanOrEqual(70); // a real, deep squat
  });

  test("teach: learn a reference from the good curl, then score the bad curl against it", async ({page}, info) => {
    need("curl_good.webm", "curl_bad.webm");
    await page.locator("#tabTeach").click();
    await page.locator("#exSel").selectOption("curl");
    await page.locator("#tplName").fill("My curl");
    await page.locator("#refFiles").setInputFiles(`${FX}/curl_good.webm`);
    await page.locator("#learn").click();
    await expect(page.locator("#teachMsg")).toHaveText(/Learned from 1 reps/, {timeout: 180_000});
    await shot(page, info, "teach");
    await page.locator("#tabTrain").click();
    const r = await analyze(page, "Bicep curl", "curl_bad.webm", "My curl");
    expect(r.tips).toMatch(/Pin your elbow to your side/);
    expect(r.score).toBeLessThanOrEqual(85);
  });

  test("library: Vital Animations ZIP → Analyze all → reference in Train", async ({page}, info) => {
    need("vital_subset.zip", "squat_youtube.webm");
    await page.locator("#tabLibrary").click();
    await page.locator("#libFiles").setInputFiles(`${FX}/vital_subset.zip`);
    await expect(page.locator("#libMsg")).toHaveText(/Imported 4 videos and 50 metadata entries/, {timeout: 60_000});
    await page.locator("#libAll").click();
    await expect(page.locator("#libMsg")).toHaveText(/^Done\. 3 of 3 animations became references, 1 skipped/, {timeout: 240_000});
    const items = (await page.locator("#libList li").allTextContents()).map(s => s.replace(/\s+/g, " "));
    for (const n of ["barbell back squat", "barbell bulgarian split squat", "barbell romanian deadlift"])
      expect(items.find(i => i.includes(n)), n).toMatch(/learned/);
    await page.locator("#libSearch").fill("back squat");
    await page.locator("#libList button[data-id]").first().click();
    await page.waitForTimeout(1500);
    await shot(page, info, "library");
    await page.locator("#tabTrain").click();
    const r = await analyze(page, "Squat", "squat_youtube.webm", "Animation: barbell back squat");
    await expect(page.locator("#pipBox")).toBeVisible();
    await shot(page, info, "case3-squat-vs-vital");
    expect(r.reps).toBe(1);
    expect(r.score).toBeGreaterThan(0);
  });
});
