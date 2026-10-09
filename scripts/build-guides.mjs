// Builds the hosted exercise guides from the Vital Animations free pack (kept OUT of git: the license
// forbids redistributing the raw files, so they live on a separate host the app downloads from).
//   node scripts/build-guides.mjs <extracted VitalAnimations dir> <out dir>
//   cd <out dir> && vercel deploy --prod
// Per clip: H.264 MP4 (phones) + VP9 WebM (test Chromium has no H.264), and the reference template the
// app's own brain learns from it (analyzed headless), all listed in <out>/guides.json.
import {chromium} from "@playwright/test";
import {execFileSync, spawn} from "child_process";
import fs from "fs";
import path from "path";
import {guessType} from "../app/src/brain/names.js";

const [,, packDir, outDir] = process.argv;
if (!packDir || !outDir) { console.error("usage: node scripts/build-guides.mjs <VitalAnimations dir> <out dir>"); process.exit(1); }
const meta = JSON.parse(fs.readFileSync(path.join(packDir, "Free50/50gymworkouts.json"), "utf8"));
const DEFAULTS = {squat: "0064", lunge: "0059", rdl: "0060"}; // shown first in the guide for each exercise
const items = meta.map(m => ({...m, type: guessType(m.name)})).filter(m => m.type);
fs.mkdirSync(path.join(outDir, "clips"), {recursive: true});

const ff = (...a) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
for (const m of items) {
  const src = path.join(packDir, "Free50/Free50", `${m.id}.mp4`), base = path.join(outDir, "clips", m.id);
  if (!fs.existsSync(`${base}.mp4`)) ff("-i", src, "-an", "-vf", "scale=540:-2", "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "28", "-movflags", "+faststart", `${base}.mp4`);
  if (!fs.existsSync(`${base}.webm`)) ff("-i", src, "-an", "-vf", "scale=540:-2", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "good", "-cpu-used", "4", `${base}.webm`);
  console.log("encoded", m.id, m.name);
}

// learn the references with the app itself (Library → Analyze all), headless
const port = 8093, server = spawn("node", ["node_modules/http-server/bin/http-server", "app", "-p", String(port), "-c-1", "--silent"], {stdio: "ignore"});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("dialog", d => d.accept());
  await page.goto(`http://localhost:${port}/`);
  await page.locator("#tabLibrary").click();
  const tmp = fs.mkdtempSync(path.join(outDir, ".json-"));
  fs.writeFileSync(path.join(tmp, "meta.json"), JSON.stringify(items));
  await page.locator("#libFiles").setInputFiles([path.join(tmp, "meta.json"), ...items.map(m => path.join(outDir, "clips", `${m.id}.webm`))]);
  await page.waitForFunction(() => /Imported/.test(document.getElementById("libMsg").textContent), null, {timeout: 120000});
  await page.locator("#libAll").click();
  await page.waitForFunction(() => /^Done|Everything/.test(document.getElementById("libMsg").textContent), null, {timeout: 1800000, polling: 2000});
  console.log(await page.locator("#libMsg").textContent());
  const {templates, records} = await page.evaluate(async () => {
    const templates = JSON.parse(localStorage.getItem("fc_templates") || "{}");
    const db = await new Promise(r => { const q = indexedDB.open("formcoach", 1); q.onsuccess = () => r(q.result); });
    const records = await new Promise(r => { const q = db.transaction("animations").objectStore("animations").getAll(); q.onsuccess = () => r(q.result.map(({blob, ...a}) => a)); });
    return {templates, records};
  });
  fs.rmSync(tmp, {recursive: true});
  const out = items.map(m => {
    const rec = records.find(a => a.id === m.id), tpl = rec?.templateName && templates[rec.templateName];
    if (!tpl) { console.warn("no reference learned for", m.id, m.name, rec?.analysis); return null; }
    const {type, ...md} = m;
    return {...md, type, default: DEFAULTS[type] === m.id, analysis: rec.analysis, template: tpl,
      mp4: `clips/${m.id}.mp4`, webm: `clips/${m.id}.webm`,
      bytes: {mp4: fs.statSync(path.join(outDir, "clips", `${m.id}.mp4`)).size, webm: fs.statSync(path.join(outDir, "clips", `${m.id}.webm`)).size}};
  }).filter(Boolean);
  const manifest = {version: new Date().toISOString().slice(0, 10) + "." + out.length, source: "Vital Animations free pack (vitalanimations.com)", items: out};
  fs.writeFileSync(path.join(outDir, "guides.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(outDir, "vercel.json"), JSON.stringify({headers: [
    {source: "/(.*)", headers: [{key: "Access-Control-Allow-Origin", value: "*"}, {key: "Cache-Control", value: "public, max-age=3600"}]},
    {source: "/clips/(.*)", headers: [{key: "Cache-Control", value: "public, max-age=31536000, immutable"}]},
  ]}, null, 1));
  fs.writeFileSync(path.join(outDir, "index.html"), "<!doctype html><title>Form Coach guides</title><p>Exercise guide media for Form Coach.</p>");
  console.log(`wrote ${out.length} guides, version ${manifest.version}`);
} finally { await browser.close(); server.kill(); }
