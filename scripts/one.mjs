// Analyze one video in Train and print the result: node scripts/one.mjs "<exercise>" <file in tests/fixtures/local> ["<reference>"] [screenshot.png]
// DUMP=out.json saves the analyzed frames for scripts/tune.mjs. Needs `npm run serve` running.
import fs from "fs";
import {chromium} from "@playwright/test";
const [,, ex, video, ref = "Built-in animation", shot] = process.argv;
const FX = process.env.FX || "tests/fixtures/local";
const b = await chromium.launch();
const p = await (await b.newContext({viewport: {width: 1280, height: 900}})).newPage();
p.on("console", m => m.text().startsWith("DBG") && console.log(m.text().slice(0, 3000)));
p.on("pageerror", e => console.log("PAGEERR", e.message));
await p.goto("http://localhost:8080/");
const t0 = Date.now();
await p.locator("#trainEx button", {hasText: ex}).first().click();
await p.locator("#tplSel").selectOption({label: ref});
await p.locator("#userFile").setInputFiles(`${FX}/${video}`);
await p.waitForFunction(() => /reps? found|No complete|can.t|Couldn/.test(document.getElementById("cue").textContent), null, {timeout: 600000, polling: 500});
console.log(await p.locator("#cue").textContent(), "|", (await p.locator("#meters .meter").allTextContents()).join(" | "), "|", (await p.locator("#tips li").allTextContents()).join(" || "), (Date.now() - t0) / 1000, "s");
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(await p.evaluate(() => window.fcLast)));
if (shot) { await p.waitForTimeout(1500); await p.screenshot({path: shot, fullPage: true}); }
await b.close();
