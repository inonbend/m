// Exercise guides: the app downloads the hosted animations once and shows "How to do it" in Train.
// Needs the guides site built locally: node scripts/build-guides.mjs <pack> tests/fixtures/local/guides-site
import {test, expect} from "@playwright/test";
import fs from "fs";
const SITE = process.env.GUIDES_DIR || "tests/fixtures/local/guides-site";

test("guides: downloaded once, shown per exercise, become references, work offline", async ({page, context}, info) => {
  test.skip(!fs.existsSync(`${SITE}/guides.json`), "build the guides site first (scripts/build-guides.mjs)");
  test.setTimeout(120_000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("./?guides=http://localhost:8081/guides.json");
  const title = page.locator("#guideTitle");
  await expect(title).toHaveText("How to do it: Dumbbell goblet squat", {timeout: 60_000});
  await expect(page.locator("#guideVideo")).toBeVisible();
  await expect.poll(() => page.locator("#guideVideo").evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await page.locator("#guideSteps li").count()).toBeGreaterThan(2);
  const refs = await page.locator("#tplSel option").allTextContents();
  expect(refs).toContain("Animation: barbell back squat");
  fs.mkdirSync("screenshots", {recursive: true});
  await page.screenshot({path: `screenshots/${info.project.name}-guide-squat.png`, fullPage: true});

  // picking an animation reference switches the guide to that animation
  await page.locator("#tplSel").selectOption({label: "Animation: barbell back squat"});
  await expect(title).toHaveText("How to do it: Barbell back squat");
  await expect(page.locator("#pipBox")).toBeVisible();

  // exercises without an animation fall back to the built-in skeleton
  await page.locator("#trainEx button", {hasText: "Push-up"}).click();
  await expect(title).toHaveText("How to do it: Push-up");
  await expect(page.locator("#guideGhost")).toBeVisible();
  await expect(page.locator("#guideVideo")).toBeHidden();

  // stored on the device: still there offline
  await expect(page.locator("#offlineChip")).toHaveText("Ready offline", {timeout: 60_000});
  await context.setOffline(true);
  await page.reload();
  await page.locator("#trainEx button", {hasText: "Romanian deadlift"}).click();
  await expect(title).toHaveText("How to do it: Barbell romanian deadlift");
  expect(errors).toEqual([]);
});

test("changing exercise mid-analysis cancels it; only the latest analysis shows", async ({page}) => {
  test.skip(!fs.existsSync(`${SITE}/clips/0059.webm`), "build the guides site first (scripts/build-guides.mjs)");
  test.setTimeout(180_000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("./?guides=http://localhost:8081/guides.json");
  await expect(page.locator("#guideTitle")).toHaveText(/goblet/i, {timeout: 60_000});
  await page.locator("#userFile").setInputFiles(`${SITE}/clips/0064.webm`); // squat analysis starts…
  await page.waitForTimeout(300);
  await page.locator("#trainEx button", {hasText: "Lunge"}).click();       // …and is cancelled
  await expect(page.locator("#guideTitle")).toHaveText("How to do it: Barbell reverse lunges"); // default guide first
  await page.locator("#userFile").setInputFiles(`${SITE}/clips/0059.webm`);
  await expect(page.locator("#cue")).toHaveText(/reps? found/, {timeout: 150_000});
  await page.waitForTimeout(3000); // a stale result would land here
  await expect(page.locator("#cue")).toHaveText(/reps? found/);
  await expect(page.locator("#trainEmpty")).toBeHidden();
  await expect(page.locator("#replayBar")).toBeVisible();
  expect(+await page.locator("#last").textContent()).toBeGreaterThanOrEqual(85); // reverse lunge vs its own reference
  expect(errors).toEqual([]);
});
