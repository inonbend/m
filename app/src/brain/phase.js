/* Where in the reference movement is the user at each frame? The same rule as live coaching:
   track the lowest primary angle since leaving the top; once it rises 8° above that, the user is
   on the way up. Match the closest reference index by primary angle within the matching half. */
import {N, EX} from "../pose/features.js";

export function phaseIndices(recs, T) {
  const E = EX[T.exercise], ref = T.mean[E.primary], mid = ref.indexOf(Math.min(...ref));
  let asc = false, minV = Infinity;
  return recs.map((r, i) => {
    const w = recs.slice(Math.max(0, i - 2), i + 1), v = w.reduce((a, x) => a + x.f[E.primary], 0) / w.length;
    if (v < T.hi - 10) minV = Math.min(minV, v);
    if (!asc && minV < T.hi - 15 && v > minV + 8) asc = true;
    if (v > T.hi) { asc = false; minV = Infinity; }
    const a0 = asc ? mid : 0, a1 = asc ? N - 1 : mid;
    let best = a0;
    for (let k = a0; k <= a1; k++) if (Math.abs(ref[k] - v) < Math.abs(ref[best] - v)) best = k;
    return best;
  });
}
