import {test, expect} from "@playwright/test";

// Collect page errors and console lines for every test.
test.beforeEach(async ({page}, info) => {
  info.errors = [];
  info.logs = [];
  page.on("pageerror", e => info.errors.push(e));
  page.on("console", m => info.logs.push(m.text()));
});

const swActive = page => expect.poll(() => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.state;
})).toBe("activated");

// The page warms the pose model into the cache after the service worker is ready.
const waitReadyOffline = page => expect(page.locator("#offlineChip")).toHaveText("Ready offline", {timeout: 60_000});

const startCamera = async (page, logs) => {
  await page.locator("#camBtn").click();
  await expect(page.locator("#stagebar")).toBeVisible({timeout: 60_000});
  await expect.poll(() => logs.some(l => l.includes("Graph successfully started running.")), {timeout: 60_000}).toBe(true);
};

test("1. loads without errors, service worker active, caches created", async ({page}, info) => {
  await page.goto("./");
  await swActive(page);
  await waitReadyOffline(page);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.some(k => k.endsWith("-shell"))).toBe(true);
  expect(keys).toContain("form-coach-model");
  expect(info.errors).toEqual([]);
});

test("2. Train tab is default, camera button enabled, built-in reference for every exercise", async ({page}, info) => {
  await page.goto("./");
  await expect(page.locator("#train")).toBeVisible();
  await expect(page.locator("#tabTrain")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#camBtn")).toBeEnabled();
  const exercises = page.locator("#trainEx button");
  const n = await exercises.count();
  expect(n).toBe(5);
  for (let i = 0; i < n; i++) {
    await exercises.nth(i).click();
    await expect(exercises.nth(i)).toHaveAttribute("aria-pressed", "true");
    const labels = await page.locator("#tplSel option").allTextContents();
    expect(labels, await exercises.nth(i).textContent()).toContain("Built-in animation");
  }
  expect(info.errors).toEqual([]);
});

test("3. Start camera shows the stage bar and runs the pose graph", async ({page}, info) => {
  await page.goto("./");
  await startCamera(page, info.logs);
  expect(info.errors).toEqual([]);
});

test("4. offline reload: chip reads 'Offline, ready' and the camera still starts", async ({page, context}, info) => {
  await page.goto("./");
  await swActive(page);
  await waitReadyOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offlineChip")).toHaveText("Offline, ready");
  await startCamera(page, info.logs);
  expect(info.errors).toEqual([]);
});
