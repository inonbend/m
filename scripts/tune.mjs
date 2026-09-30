// Offline scoring experiments on frames saved with DUMP= by scripts/one.mjs: node scripts/tune.mjs [dir]
import fs from "fs";
const R=new URL("../app/src/",import.meta.url).href,DIR=process.argv[2]||"tests/fixtures/local/dump";
const {EX}=await import(R+"pose/features.js");
const {repFrom,smooth,segment}=await import(R+"brain/segment.js");
const {builtin}=await import(R+"brain/builtins.js");
const {compare}=await import(R+"brain/dtw.js");
for (const opt of [{},{worst:.5}]) {
  const line=[];
  for (const [n,ex] of [["cg","curl"],["cb","curl"],["sq","squat"]]) {
    const d=JSON.parse(fs.readFileSync(`${DIR}/${n}.json`)),T=builtin(ex),E=EX[ex];
    const reps=segment(smooth(d.recs.map(r=>r.f[E.primary])),T.hi,T.lo);
    for (const [s,e,ms,me] of reps){const rep=repFrom(d.recs.slice(s,e+1),E.feats,ms-s,me-s),r=compare(rep,T,opt);
      line.push(`${n}:${r.score} ${rep.dur.toFixed(1)}s [${Object.values(r.parts).map(Math.round).join(",")}] ${r.tips.map(t=>t.key.replace(/On the way |At the /,"")).join("/")}`)}
  }
  console.log(JSON.stringify(opt).padEnd(14),line.join("  |  "));
}
