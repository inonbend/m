import {describe, it, expect} from "vitest";
import {angle, fromVertical, N, EX, FEATS, PTS, toJoints, normPose, record} from "../../app/src/pose/features.js";
import {smooth, resample, thresholds, segment, repFrom} from "../../app/src/brain/segment.js";
import {buildTemplate} from "../../app/src/brain/template.js";
import {fk, builtin, MOTION} from "../../app/src/brain/builtins.js";
import {compare} from "../../app/src/brain/dtw.js";
import {slug, guessType} from "../../app/src/brain/names.js";

const min = a => Math.min(...a), max = a => Math.max(...a);
// A built-in template's own curves, shaped as a rep (60 samples, pose per sample).
const repOf = (tpl, dur = tpl.dur) => ({f: structuredClone(tpl.mean), pose: tpl.pose, dur});
// Stretch a 60-sample series in time: the movement takes `k`× as many samples, then resample to 60.
const stretchSeries = (a, k) => resample(resample(a, Math.round(N * k)), N);

describe("geometry", () => {
  it("angle", () => {
    expect(angle({x: 1, y: 0}, {x: 0, y: 0}, {x: 0, y: 1})).toBeCloseTo(90);
    expect(angle({x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0})).toBeCloseTo(180);
    expect(angle({x: 1, y: 0}, {x: 0, y: 0}, {x: 1, y: 1})).toBeCloseTo(45);
    expect(angle({x: 0, y: 0}, {x: 0, y: 0}, {x: 1, y: 0})).toBeCloseTo(90); // degenerate: no NaN
  });
  it("fromVertical", () => {
    expect(fromVertical({x: 0, y: 0}, {x: 0, y: 1})).toBeCloseTo(0);
    expect(fromVertical({x: 1, y: 0}, {x: 0, y: 1})).toBeCloseTo(45);
    expect(fromVertical({x: -1, y: 0}, {x: 0, y: 1})).toBeCloseTo(45);
    expect(fromVertical({x: 1, y: 1}, {x: 0, y: 1})).toBeCloseTo(90);
  });
});

describe("signal processing", () => {
  it("smooth is a centered moving average of window 5", () => {
    expect(smooth([0, 0, 10, 0, 0])).toEqual([10 / 3, 2.5, 2, 2.5, 10 / 3]);
    expect(smooth([4, 4, 4])).toEqual([4, 4, 4]);
  });
  it("resample keeps endpoints and interpolates linearly", () => {
    const r = resample([0, 10], 5);
    expect(r).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(resample([1, 2, 3]).length).toBe(N);
  });
  it("thresholds", () => {
    expect(thresholds([100, 180, 60])).toEqual({hi: 150, lo: 108, range: 120});
  });
  it("segment finds 3 reps in a 3-rep cosine signal", () => {
    const sig = [];
    for (let i = 0; i < 3 * 40; i++) sig.push(130 + 50 * Math.cos(2 * Math.PI * i / 40));
    const th = thresholds(sig);
    const reps = segment(smooth(sig), th.hi, th.lo);
    expect(reps.length).toBe(3);
    reps.forEach(([s, e]) => expect(e - s).toBeGreaterThanOrEqual(6));
  });
  it("segment ignores dips that do not reach lo", () => {
    const sig = Array.from({length: 80}, (_, i) => 180 - 10 * Math.sin(Math.PI * i / 79));
    expect(segment(sig, 170, 100)).toEqual([]);
  });
  it("repFrom time-normalizes to N samples", () => {
    const recs = Array.from({length: 30}, (_, i) => ({t: i / 15, f: {knee: 180 - i}, pose: [[i, 0]]}));
    const rep = repFrom(recs, ["knee"]);
    expect(rep.f.knee.length).toBe(N);
    expect(rep.pose.length).toBe(N);
    expect(rep.dur).toBeCloseTo(29 / 15);
    expect(rep.pose[0]).toEqual([[0, 0]]);
    expect(rep.pose[N - 1]).toEqual([[29, 0]]);
  });
});

describe("built-in animations", () => {
  it("fk builds the chain from the ankle with unit torso", () => {
    const j = fk(MOTION.squat.top);
    expect(j.ankle).toEqual({x: 0, y: 0});
    expect(Math.hypot(j.sh.x - j.hip.x, j.sh.y - j.hip.y)).toBeCloseTo(1);
    expect(Math.hypot(j.knee.x - j.ankle.x, j.knee.y - j.ankle.y)).toBeCloseTo(1.05);
  });
  it("squat: knee 180→75, hip min ≈ 65, torso 5→40", () => {
    const t = builtin("squat");
    expect(max(t.mean.knee)).toBeCloseTo(180, 0);
    expect(min(t.mean.knee)).toBeCloseTo(75, 0);
    expect(min(t.mean.hip)).toBeCloseTo(65, 0);
    expect(min(t.mean.torso)).toBeCloseTo(5, 0);
    expect(max(t.mean.torso)).toBeCloseTo(40, 0);
  });
  it.each([["lunge", "knee", 87], ["rdl", "hip", 87], ["pushup", "elbow", 85], ["curl", "elbow", 48]])(
    "%s: %s bottoms out near %i°", (ex, k, bottom) => {
      expect(Math.abs(min(builtin(ex).mean[k]) - bottom)).toBeLessThan(2);
    });
  it("templates have the documented shape", () => {
    for (const k of Object.keys(EX)) {
      const t = builtin(k);
      expect(t.name).toBe(EX[k].name + " (built-in)");
      expect(Object.keys(t.mean)).toEqual(EX[k].feats);
      EX[k].feats.forEach(f => { expect(t.mean[f].length).toBe(N); expect(t.std[f].every(s => s === 8)).toBe(true); });
      expect(t.pose.length).toBe(N);
      expect(t.pose[0].length).toBe(PTS.length);
      expect(t.hi).toBeGreaterThan(t.lo);
    }
  });
});

describe("templates", () => {
  it("buildTemplate averages reps with a 6° std floor", () => {
    const b = builtin("squat"), r1 = repOf(b, 2), r2 = repOf(b, 3);
    r2.f = Object.fromEntries(Object.entries(r2.f).map(([k, a]) => [k, a.map(v => v + 4)]));
    const t = buildTemplate("mine", "squat", [r1, r2], 2);
    expect(t.mean.knee[0]).toBeCloseTo(b.mean.knee[0] + 2, 1);
    expect(t.std.knee.every(s => s === 6)).toBe(true); // real sd is 2 → floored
    expect(t.dur).toBe(2.5);
    expect(t.sources).toBe(2);
    expect(t.reps.length).toBe(2);
  });
});

describe("compare (DTW)", () => {
  it("a built-in rep against its own template scores ≈ 100", () => {
    for (const k of Object.keys(EX)) {
      const t = builtin(k), r = compare(repOf(t), t);
      expect(r.score, k).toBeGreaterThanOrEqual(99);
      expect(r.tips).toEqual([]);
      expect(r.aligned.length).toBe(N);
    }
  });
  it("a shallow squat (knee min 110) scores low on knee and says bend more at the bottom", () => {
    const t = builtin("squat"), rep = repOf(t);
    const lo = min(t.mean.knee), hi = max(t.mean.knee);
    rep.f.knee = t.mean.knee.map(v => hi - (hi - v) * (hi - 110) / (hi - lo));
    expect(min(rep.f.knee)).toBeCloseTo(110);
    const r = compare(rep, t);
    expect(r.parts["Knee angle"]).toBeLessThan(75);
    expect(r.parts["Hip angle"]).toBe(100);
    const tip = r.tips.find(x => x.key === "kneeAt the bottom");
    expect(tip).toBeTruthy();
    expect(tip.short).toBe(FEATS.knee.hint["+"]);
    expect(tip.text).toMatch(/^At the bottom, your knee angle is \d+° larger than the reference\. Bend your knees more\.$/);
  });
  it("is robust to a 1.5× time-stretched rep: tempo drops, features stay high", () => {
    const t = builtin("squat"), base = repOf(t);
    // hold the bottom longer (stretch the middle third) and take 1.5× as long overall
    const stretched = {...base, dur: t.dur * 1.5, f: Object.fromEntries(Object.entries(base.f).map(([k, a]) =>
      [k, resample([...a.slice(0, 20), ...stretchSeries(a.slice(20, 40), 2).slice(0, 40), ...a.slice(40)], N)]))};
    const r = compare(stretched, t);
    expect(r.parts.Tempo).toBeLessThan(60);
    EX.squat.feats.forEach(k => expect(r.parts[FEATS[k].label], k).toBeGreaterThanOrEqual(90));
    expect(r.tips.some(x => x.key === "fast" || x.key === "slow")).toBe(false); // 1.5 is not > 1.5
  });
  it("tempo tips", () => {
    const t = builtin("curl");
    expect(compare(repOf(t, t.dur * 0.5), t).tips.map(x => x.key)).toContain("fast");
    expect(compare(repOf(t, t.dur * 2), t).tips.map(x => x.key)).toContain("slow");
  });
});

describe("landmarks → joints", () => {
  // 33 landmarks: a side-on standing person on the left side of the body, facing +x.
  const lms = (vis = {L: 0.9, R: 0.2}) => {
    const lm = Array.from({length: 33}, () => ({x: 0.5, y: 0.5, visibility: 0.1}));
    const put = (side, pts) => Object.entries(pts).forEach(([i, [x, y]]) => lm[i] = {x, y, visibility: vis[side]});
    put("L", {0: [0.52, 0.1], 11: [0.5, 0.2], 13: [0.5, 0.35], 15: [0.5, 0.48], 23: [0.5, 0.5], 25: [0.5, 0.7], 27: [0.5, 0.9], 29: [0.48, 0.92], 31: [0.56, 0.92]});
    put("R", {12: [0.5, 0.2], 14: [0.5, 0.35], 16: [0.5, 0.48], 24: [0.5, 0.5], 26: [0.5, 0.7], 28: [0.5, 0.9], 30: [0.52, 0.92], 32: [0.44, 0.92]});
    return lm;
  };
  it("toJoints picks the more visible side and applies aspect", () => {
    const j = toJoints(lms(), 4 / 3);
    expect(j.ids).toEqual([0, 11, 13, 15, 23, 25, 27, 29, 31]);
    expect(j.hip.x).toBeCloseTo(0.5 * 4 / 3);
    expect(toJoints(lms({L: 0.2, R: 0.9}), 1).ids[1]).toBe(12);
  });
  it("normPose puts the hip at the origin, scales by torso, faces +x", () => {
    const p = normPose(toJoints(lms(), 1));
    expect(p[4]).toEqual([0, 0]);
    expect(p[1]).toEqual([0, -1]);
    expect(p[0][0]).toBeGreaterThan(0);
    // same nose, but the (more visible) right foot points -x, so x is flipped
    const q = normPose(toJoints(lms({L: 0.2, R: 0.9}), 1));
    expect(q[0][0]).toBeCloseTo(-p[0][0]);
  });
  it("record rejects frames with a needed joint below 0.5 visibility", () => {
    expect(record(lms(), 1, "squat", 0).f.knee).toBeCloseTo(180);
    expect(record(lms({L: 0.4, R: 0.3}), 1, "squat", 0)).toBeNull();
  });
});

describe("names", () => {
  it("slug", () => {
    expect(slug("Barbell Back-Squat 2")).toBe("barbellbacksquat2");
    expect(slug(null)).toBe("");
  });
  it.each([
    ["Bulgarian Split Squat", "lunge"], ["Walking Lunge", "lunge"], ["Goblet Squat", "squat"],
    ["Romanian Deadlift", "rdl"], ["DB RDL", "rdl"], ["Push-up", "pushup"], ["Pushup", "pushup"],
    ["Hammer Curl", "curl"], ["Plank", ""],
    ["lying leg curl machine", ""], ["seated leg curl machine", ""], ["dumbbell hip hinge", "rdl"],
    ["barbell bulgarian split squat", "lunge"], ["barbell reverse lunges", "lunge"], ["hack squat machine", "squat"],
  ])("guessType(%s) = %s", (n, t) => expect(guessType(n)).toBe(t));
});

describe("rep boundaries", () => {
  it("reps run from peak to peak, not threshold to threshold", () => {
    const sig = [];
    for (let i = 0; i < 3 * 40; i++) sig.push(130 + 50 * Math.cos(2 * Math.PI * i / 40));
    const th = thresholds(sig), reps = segment(sig, th.hi, th.lo);
    expect(reps.map(r => r.slice(0, 2))).toEqual([[0, 40], [40, 80], [80, 119]]);
  });
  it("tempo leaves out a pause at the top", () => {
    // 20 frames of hold at the top, then a 20-frame rep
    const sig = [...Array.from({length: 20}, (_, i) => 177 - i * 0.1), ...Array.from({length: 21}, (_, i) => 115 + 60 * Math.cos(2 * Math.PI * i / 20))];
    const [[s, e, ms, me]] = segment(sig, 150, 90);
    expect(s).toBeLessThan(20);
    expect(ms).toBeGreaterThanOrEqual(19);
    expect(e).toBe(40);
    const recs = sig.map((v, i) => ({t: i / 10, f: {elbow: v}, pose: [[0, 0]]}));
    expect(repFrom(recs.slice(s, e + 1), ["elbow"], ms - s, me - s).dur).toBeLessThan(2.2);
  });
});

describe("lunge side", () => {
  it("scores the front leg even when the rear leg is more visible", async () => {
    const {record, IDX} = await import("../../app/src/pose/features.js");
    const lm = Array.from({length: 33}, () => ({x: .5, y: .5, visibility: .9}));
    const put = (side, pts, v) => pts.forEach((p, k) => (lm[IDX[side][k]] = {x: p[0], y: p[1], visibility: v}));
    // [nose, sh, el, wr, hip, knee, ankle, heel, toe]
    const front = [[.5, .1], [.5, .2], [.5, .3], [.5, .4], [.5, .5], [.65, .5], [.65, .7], [.63, .72], [.7, .72]]; // thigh level
    const rear = [[.5, .1], [.5, .2], [.5, .3], [.5, .4], [.5, .5], [.45, .7], [.3, .72], [.28, .72], [.33, .72]];  // knee down, hip open
    put("L", rear, .99); put("R", front, .8);
    const r = record(lm, 1, "lunge", 0);
    expect(r.j.ids).toEqual(IDX.R);
    expect(r.f.hip).toBeLessThan(120);
    expect(record(lm, 1, "squat", 0).j.ids).toEqual(IDX.L); // other exercises: most visible side
  });
});
