import {describe, it, expect} from "vitest";
import {fitGhost} from "../../app/src/live/ghost.js";
import {angle, normPose} from "../../app/src/pose/features.js";
import {builtin} from "../../app/src/brain/builtins.js";

const P = ([x, y]) => ({x, y});
// a side-on user facing +x, longer shins than the reference
const user = () => ({nose: {x: 1.05, y: .2, v: 1}, sh: {x: 1, y: .3, v: 1}, el: {x: 1, y: .45, v: 1}, wr: {x: 1.1, y: .55, v: 1},
  hip: {x: 1, y: .6, v: 1}, knee: {x: 1, y: .8, v: 1}, ankle: {x: 1, y: 1.05, v: 1}, heel: {x: .97, y: 1.07, v: 1}, toe: {x: 1.06, y: 1.07, v: 1}});

describe("fitGhost", () => {
  it("reproduces the user exactly when the reference is the user's own pose", () => {
    const j = user(), g = fitGhost(normPose(j), j);
    ["nose", "sh", "el", "wr", "hip", "knee", "ankle"].forEach((n, k) => {
      expect(g.pts[k][0]).toBeCloseTo(j[n].x, 2);
      expect(g.pts[k][1]).toBeCloseTo(j[n].y, 2);
    });
  });
  it("keeps the reference joint angles and the user's bone lengths, from the user's ankle", () => {
    const j = user(), ref = builtin("squat").pose[30], g = fitGhost(ref, j);
    expect(g.anchor).toBe(6);
    expect(g.pts[6]).toEqual([j.ankle.x, j.ankle.y]);
    expect(angle(P(g.pts[4]), P(g.pts[5]), P(g.pts[6]))).toBeCloseTo(angle(P(ref[4]), P(ref[5]), P(ref[6])), 1);
    expect(Math.hypot(g.pts[5][0] - g.pts[6][0], g.pts[5][1] - g.pts[6][1])).toBeCloseTo(.25, 3); // user's shin
    expect(Math.hypot(g.pts[4][0] - g.pts[5][0], g.pts[4][1] - g.pts[5][1])).toBeCloseTo(.2, 3);  // user's thigh
  });
  it("anchors at the hip and skips the legs when the feet are out of frame", () => {
    const j = user();
    j.ankle.v = j.knee.v = .1;
    const g = fitGhost(builtin("curl").pose[30], j);
    expect(g.anchor).toBe(4);
    expect(g.pts[4]).toEqual([j.hip.x, j.hip.y]);
  });
  it("mirrors to the user's facing direction", () => {
    const j = user(); for (const k in j) j[k].x = 2 - j[k].x; // facing -x
    const g = fitGhost(builtin("squat").pose[30], j);
    expect(g.pts[5][0]).toBeLessThan(j.ankle.x); // knee travels forward = toward -x
  });
});
