/* Several people in an uploaded video (a coach, people in the background): link detections
   frame to frame by hip position, then keep the person whose primary angle moves the most. */
import {smooth, thresholds} from "./segment.js";

/** frames: [{t, cands:[rec]}] where rec = record(...) with rec.j joints. Returns tracks (arrays of recs). */
export function buildTracks(frames, maxJump = .9, maxGap = 1) {
  const tracks = [];
  for (const {t, cands} of frames) {
    const used = new Set();
    // match the closest (track, candidate) pairs first
    const pairs = [];
    tracks.forEach((tr, ti) => {
      const last = tr[tr.length - 1];
      if (t - last.t > maxGap) return;
      // body scale: the largest recent torso length (leaning toward the camera shortens it)
      const torso = Math.max(...tr.slice(-15).map(r => Math.hypot(r.j.sh.x - r.j.hip.x, r.j.sh.y - r.j.hip.y))) || 1;
      cands.forEach((c, ci) => {
        const d = Math.hypot(c.j.hip.x - last.j.hip.x, c.j.hip.y - last.j.hip.y) / torso;
        if (d < maxJump) pairs.push([d, ti, ci]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const doneT = new Set();
    for (const [, ti, ci] of pairs) if (!doneT.has(ti) && !used.has(ci)) { tracks[ti].push(cands[ci]); doneT.add(ti); used.add(ci); }
    cands.forEach((c, ci) => { if (!used.has(ci)) tracks.push([c]); });
  }
  return tracks;
}

/** The exerciser: the track with the largest range of its (smoothed) primary angle, needing ≥ 10 frames.
    Uses 3D features (rec.f3) when present since they don't depend on the camera angle. Falls back to the longest track. */
export function pickTrack(tracks, primary) {
  let best = null, bestScore = -1;
  for (const tr of tracks) {
    if (tr.length < 10) continue;
    const r = thresholds(smooth(tr.map(x => (x.f3 || x.f)[primary]))).range, score = r + tr.length * .05;
    if (score > bestScore) { bestScore = score; best = tr; }
  }
  return best || tracks.reduce((a, b) => (b.length > a.length ? b : a), []);
}
