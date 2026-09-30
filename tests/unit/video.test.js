import {describe, it, expect} from "vitest";
import {angle, fromVertical, features3, IDX, EX} from "../../app/src/pose/features.js";
import {roiCandidates, poseFit, pickRoi, padRoi} from "../../app/src/pose/roi.js";
import {buildTracks, pickTrack} from "../../app/src/brain/track.js";
import {phaseIndices} from "../../app/src/brain/phase.js";
import {builtin} from "../../app/src/brain/builtins.js";

describe("3D angles", () => {
  it("2D results are unchanged when there is no z", () => {
    expect(angle({x: 1, y: 0}, {x: 0, y: 0}, {x: 0, y: 1})).toBeCloseTo(90);
    expect(fromVertical({x: 1, y: 0}, {x: 0, y: 1})).toBeCloseTo(45);
  });
  it("a knee bent toward the camera is measured correctly in 3D but not in 2D", () => {
    // thigh points straight at the camera (z), shin hangs down: a 90° knee that looks straight in 2D
    const hip = {x: 0, y: 0, z: -1}, knee = {x: 0, y: 0, z: 0}, ankle = {x: 0, y: 1, z: 0};
    expect(angle(hip, knee, ankle)).toBeCloseTo(90);
    expect(angle({x: 0, y: -0.01}, {x: 0, y: 0}, {x: 0, y: 1})).toBeCloseTo(180);
  });
  it("fromVertical counts sideways lean in depth too", () => {
    expect(fromVertical({x: 0, y: -1, z: 1}, {x: 0, y: 0, z: 0})).toBeCloseTo(45);
  });
  it("features3 uses the given side", () => {
    const wl = Array.from({length: 33}, () => ({x: 0, y: 0, z: 0}));
    const [, sh, el, wr, hip] = IDX.L;
    wl[sh] = {x: 0, y: -0.5, z: 0}; wl[el] = {x: 0, y: -0.2, z: 0}; wl[wr] = {x: 0, y: -0.2, z: -0.3}; wl[hip] = {x: 0, y: 0, z: 0};
    expect(features3(wl, IDX.L, "curl").elbow).toBeCloseTo(90);
  });
});

describe("region of interest", () => {
  it("full frame first, bands for a portrait screen recording", () => {
    const c = roiCandidates(1206, 2622);
    expect(c[0]).toEqual([0, 0, 1, 1]);
    const band = c.find(([x, y, w, h]) => w === 1 && Math.abs(h - 1206 * 9 / 16 / 2622) < 1e-3);
    expect(band).toBeTruthy();
    c.forEach(([x, y, w, h]) => { expect(x + w).toBeLessThanOrEqual(1 + 1e-9); expect(y + h).toBeLessThanOrEqual(1 + 1e-9); });
  });
  const lm = (vis, x = 0.5) => Array.from({length: 33}, (_, i) => ({x, y: 0.1 + i * 0.02, visibility: vis}));
  it("poseFit needs every needed joint visible and inside", () => {
    expect(poseFit(lm(0.9), [11, 23, 25, 27])).toBeGreaterThan(1);
    expect(poseFit(lm(0.3), [11, 23, 25, 27])).toBe(0);
    expect(poseFit(lm(0.9, 1.2), [11])).toBe(0);
  });
  it("pickRoi keeps the full frame unless a crop sees the person in more frames", () => {
    const cands = [[0, 0, 1, 1], [0, 0, 1, .3], [0, .3, 1, .3]];
    expect(pickRoi(cands, [[0, 0, 0], [1.1, 1.2, 1.1], [0, 1, 0]])).toBe(cands[1]);
    expect(pickRoi(cands, [[1, 1, 1], [1.2, 1.2, 1.2], [0, 0, 0]])).toBe(cands[0]);
  });
  it("padRoi grows and clamps", () => {
    const [x, y, w, h] = padRoi([0, .5, 1, .25], .1);
    expect([x, w]).toEqual([0, 1]);
    expect(y).toBeCloseTo(.475); expect(h).toBeCloseTo(.3);
  });
});

describe("multi-person tracking", () => {
  // two people: a coach standing still at x=.6 and an exerciser at x=1 whose knee goes 180→90→180
  const person = (x, knee, t) => ({t, f: {knee}, j: {hip: {x, y: .5}, sh: {x, y: .35}}});
  const frames = Array.from({length: 40}, (_, i) => {
    const t = i / 15, knee = 135 + 45 * Math.cos(2 * Math.PI * i / 39);
    // the detector often sees only one of them: alternate
    const c = i % 3 === 0 ? [person(.6, 178, t)] : i % 3 === 1 ? [person(1, knee, t)] : [person(1, knee, t), person(.6, 177, t)];
    return {t, cands: c};
  });
  it("links detections into one track per person", () => {
    const tr = buildTracks(frames);
    expect(tr.length).toBe(2);
  });
  it("picks the person who moves", () => {
    const tr = pickTrack(buildTracks(frames), "knee");
    expect(tr.every(r => r.j.hip.x === 1)).toBe(true);
  });
  it("prefers 3D features when present", () => {
    const tr = buildTracks(frames);
    tr.forEach(t => t.forEach(r => (r.f3 = {knee: r.j.hip.x === 1 ? 170 : 90 + (r.t * 30) % 90})));
    expect(pickTrack(tr, "knee")[0].j.hip.x).toBe(.6);
  });
});

describe("phase", () => {
  it("follows the reference down then up", () => {
    const T = builtin("squat"), recs = T.mean.knee.map(k => ({f: {knee: k}}));
    const idx = phaseIndices(recs, T);
    expect(idx[0]).toBe(0);
    expect(Math.abs(idx[30] - 30)).toBeLessThanOrEqual(3);
    expect(idx[50]).toBeGreaterThan(30);
  });
});

describe("side pose from 3D", () => {
  it("a person facing the camera is turned into a side view facing +x", async () => {
    const {sidePose3} = await import("../../app/src/pose/features.js");
    const wl = Array.from({length: 33}, () => ({x: 0, y: 0, z: 0}));
    const set = (i, x, y, z) => (wl[i] = {x, y, z});
    // hips left-right along x; thighs point toward the camera (-z) as in a squat; toes point -z
    set(23, -0.1, 0, 0); set(24, 0.1, 0, 0);
    set(11, -0.15, -0.5, 0.05); set(25, -0.1, 0.1, -0.4); set(27, -0.1, 0.5, -0.3);
    set(29, -0.1, 0.55, -0.25); set(31, -0.1, 0.55, -0.4);
    set(0, -0.1, -0.7, 0); set(13, -0.2, -0.3, 0); set(15, -0.2, -0.1, 0);
    const p = sidePose3(wl, IDX.L);
    expect(p[4]).toEqual([0, 0]);
    expect(Math.hypot(...p[1])).toBeCloseTo(1, 2);
    expect(p[5][0]).toBeGreaterThan(0.5); // knee well in front of the hip
  });
});
