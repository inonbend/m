// Live camera with a y4m file as the webcam: node scripts/live.mjs <file.y4m> ["<exercise>"] [seconds] [screenshot.png]
import {chromium} from "@playwright/test";
const [,, y4m, ex = "Bicep curl", secs = "25", shot] = process.argv;
const b = await chromium.launch({args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`]});
const ctx = await b.newContext({viewport: {width: 1280, height: 900}, permissions: ["camera"]});
const p = await ctx.newPage();
p.on("pageerror", e => console.log("PAGEERR", e.message));
await p.goto("http://localhost:8080/");
await p.locator("#trainEx button", {hasText: ex}).first().click();
await p.locator("#camBtn").click();
await p.locator("#stagebar").waitFor({state: "visible", timeout: 60000});
const t0 = Date.now(); let shotTaken = false;
while (Date.now() - t0 < +secs * 1000) {
  await p.waitForTimeout(1000);
  const st = await p.evaluate(() => ({reps: document.getElementById("reps").textContent, last: document.getElementById("last").textContent, cue: document.getElementById("cue").textContent, status: document.getElementById("liveStatus").textContent}));
  console.log(((Date.now() - t0) / 1000).toFixed(0) + "s", JSON.stringify(st));
  if (shot && !shotTaken && st.status === "In rep" && +st.reps >= 1) { await p.waitForTimeout(400); await p.screenshot({path: shot, fullPage: true}); shotTaken = true; }
}
if (shot && !shotTaken) await p.screenshot({path: shot, fullPage: true});
console.log("tips", (await p.locator("#tips li").allTextContents()).join(" || "));
await b.close();
