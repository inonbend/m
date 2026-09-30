// Live camera with real footage: the good curl clip is fed to Chromium's fake webcam (loops).
import {test, expect} from "@playwright/test";
import fs from "fs";
const Y4M = "tests/fixtures/local/curl_good.y4m";

test.use({launchOptions: {args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${Y4M}`]}});

test("live: counts and scores curl reps from the camera", async ({page}, info) => {
  test.skip(!fs.existsSync(Y4M), "run scripts/prepare-fixtures.sh");
  test.setTimeout(120_000);
  const errors = [];page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await page.locator("#trainEx button", {hasText: "Bicep curl"}).click();
  await page.locator("#camBtn").click();
  await expect(page.locator("#stagebar")).toBeVisible({timeout: 60_000});
  await expect(page.locator("#reps")).toHaveText(/^[2-9]/, {timeout: 60_000});
  await expect(page.locator("#liveStatus")).toHaveText("In rep", {timeout: 15_000});
  await page.waitForTimeout(700);
  fs.mkdirSync("screenshots", {recursive: true});
  await page.screenshot({path: `screenshots/${info.project.name}-live-camera.png`, fullPage: true});
  const first = await page.locator("#replist button").first().textContent();
  expect(+first.split(": ")[1]).toBeGreaterThanOrEqual(90); // the first rep is a clean curl
  expect(errors).toEqual([]);
});
