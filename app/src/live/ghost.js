/* Fit the reference ("ghost") pose onto the user's body: keep the reference's bone directions
   (its joint angles) but use the user's own bone lengths, starting from the user's ankle, or from
   the hip when the feet are out of frame. A torso-scaled copy drifts off the body whenever the
   user's legs or arms are longer or shorter than the reference's. */
import {PTS} from "../pose/features.js";

// PTS order: 0 nose, 1 sh, 2 el, 3 wr, 4 hip, 5 knee, 6 ankle. Bones as [parent, child] in build order.
const FROM_ANKLE = [[6, 5], [5, 4], [4, 1], [1, 0], [1, 2], [2, 3]];
const FROM_HIP = [[4, 1], [1, 0], [1, 2], [2, 3], [4, 5], [5, 6]];

/** p: reference pose (normPose format, faces +x). j: user joints ({x,y,v}, aspect units).
    Returns the ghost joints in the user's coordinates: {anchor, pts:[[x,y] × 7]} (legs omitted when anchored at the hip). */
export function fitGhost(p, j) {
  const dir = (j.toe.x - j.heel.x) >= 0 ? 1 : -1, A = j.ankle.v > .5 ? 6 : 4;
  const pts = Array(7).fill(null);
  pts[A] = [j[PTS[A]].x, j[PTS[A]].y];
  const torso = Math.hypot(j.sh.x - j.hip.x, j.sh.y - j.hip.y) || 1;
  for (const [a, b] of A === 6 ? FROM_ANKLE : FROM_HIP) {
    const dx = (p[b][0] - p[a][0]) * dir, dy = p[b][1] - p[a][1], dl = Math.hypot(dx, dy) || 1;
    // the user's bone length; fall back to the reference proportion when that joint is not visible
    const ua = j[PTS[a]], ub = j[PTS[b]];
    const len = ua.v > .5 && ub.v > .5 ? Math.hypot(ub.x - ua.x, ub.y - ua.y) : dl * torso;
    pts[b] = [pts[a][0] + dx / dl * len, pts[a][1] + dy / dl * len];
  }
  return {anchor: A, pts};
}
