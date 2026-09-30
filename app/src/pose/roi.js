/* Region of interest for uploaded videos: screen recordings and phone clips often show the
   exerciser small, inside a player, next to other people or thumbnails. We try a set of crops
   on a few sample frames and keep the one where the pose model sees the needed joints best. */

/** Candidate crops as normalized [x, y, w, h]; the full frame first. */
export function roiCandidates(W, H) {
  const out = [[0, 0, 1, 1]], add = r => { if (!out.some(o => o.every((v, i) => Math.abs(v - r[i]) < 1e-3))) out.push(r.map(v => +v.toFixed(4))); };
  const bands = (len, step, mk) => { for (let s = 0; s <= 1 - len + 1e-9; s += step) add(mk(s)); if (len < 1) add(mk(1 - len)); };
  if (H > W * 1.2) // portrait frame: a landscape player somewhere along the height
    for (const ar of [9 / 16, 3 / 4, 1]) { const h = Math.min(1, W * ar / H); bands(h, h / 2, s => [0, s, 1, h]); }
  else if (W > H * 1.2) // landscape frame: a portrait player somewhere along the width
    for (const ar of [9 / 16, 3 / 4, 1]) { const w = Math.min(1, H * ar / W); bands(w, w / 2, s => [s, 0, w, 1]); }
  for (let y = 0; y <= .5; y += .25) for (let x = 0; x <= .5; x += .25) add([x, y, .5, .5]); // small, far-away people
  return out;
}

/** How well one pose (33 landmarks, normalized to the crop) shows the needed joints.
    Returns 0 when a needed joint is hidden or outside the crop, else 1 + a bonus for margin from the edges. */
export function poseFit(lm, needIdx) {
  for (const i of needIdx) { const p = lm[i]; if ((p.visibility ?? 0) <= .5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return 0; }
  const xs = lm.map(p => p.x), ys = lm.map(p => p.y);
  const margin = Math.min(Math.min(...xs), 1 - Math.max(...xs), Math.min(...ys), 1 - Math.max(...ys));
  return 1 + Math.max(0, Math.min(.25, margin));
}

/** Pick the best crop. `scores[c]` is the list of per-frame best poseFit values for candidate c.
    A crop must see the person in clearly more frames than the full frame to win. */
export function pickRoi(cands, scores) {
  const seen = s => s.filter(v => v > 0).length, total = s => s.reduce((a, b) => a + b, 0);
  let best = 0;
  cands.forEach((_, c) => {
    const a = seen(scores[c]), b = seen(scores[best]);
    if (a > b || (a === b && total(scores[c]) > total(scores[best]) + .05 * a)) best = c;
  });
  if (best && seen(scores[best]) <= seen(scores[0])) best = 0;
  return cands[best];
}

/** Grow a crop by `pad` of its size on each side, clamped to the frame. */
export function padRoi([x, y, w, h], pad = .08) {
  const x0 = Math.max(0, x - w * pad), y0 = Math.max(0, y - h * pad), x1 = Math.min(1, x + w * (1 + pad)), y1 = Math.min(1, y + h * (1 + pad));
  return [x0, y0, x1 - x0, y1 - y0];
}
