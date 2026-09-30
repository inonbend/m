// Per-frame pose dump for a video: node scripts/diag.mjs <file.webm> <exercise key> [fps]  (DELEGATE=GPU|CPU)
import {chromium} from "@playwright/test";
import fs from "fs";
const [,, video, exKey, fps = "15"] = process.argv;
const b = await chromium.launch();
const p = await b.newPage();
p.on("pageerror", e => console.log("PAGEERR", e.message));
await p.goto("http://localhost:8080/");
const buf = fs.readFileSync(video).toString("base64");
const out = await p.evaluate(async ({buf, exKey, fps, delegate}) => {
  const {PoseLandmarker, FilesetResolver} = await import("./vendor/tasks-vision/vision_bundle.mjs");
  const F = await import("./src/pose/features.js");
  const fsr = await FilesetResolver.forVisionTasks(new URL("./vendor/tasks-vision/wasm", location.href).href);
  const lmk = await PoseLandmarker.createFromOptions(fsr, {baseOptions: {modelAssetPath: "./models/pose_landmarker_full.task", delegate}, runningMode: "VIDEO", numPoses: 1});
  const blob = await (await fetch("data:video/webm;base64," + buf)).blob();
  const v = document.createElement("video"); v.muted = true; v.src = URL.createObjectURL(blob);
  await new Promise(r => v.onloadeddata = r);
  const aspect = v.videoWidth / v.videoHeight, rows = []; let ts = 0;
  for (let t = 0; t < v.duration; t += 1 / fps) {
    await new Promise(r => { v.onseeked = r; v.currentTime = t; });
    const lm = lmk.detectForVideo(v, ts += 40).landmarks?.[0];
    if (!lm) { rows.push({t: +t.toFixed(2), none: 1}); continue; }
    const j = F.toJoints(lm, aspect), E = F.EX[exKey];
    const vis = Object.fromEntries(E.need.map(k => [k, +j[k].v.toFixed(2)]));
    const f = Object.fromEntries(E.feats.map(k => [k, Math.round(F.FEATS[k].f(j))]));
    rows.push({t: +t.toFixed(2), side: j.ids[1] === 11 ? "L" : "R", vis, f, hip: [+j.hip.x.toFixed(2), +j.hip.y.toFixed(2)]});
  }
  return {w: v.videoWidth, h: v.videoHeight, d: v.duration, rows};
}, {buf, exKey, fps: +fps, delegate: process.env.DELEGATE || "CPU"});
console.log(out.w, out.h, out.d);
out.rows.forEach(r => console.log(JSON.stringify(r)));
await b.close();
