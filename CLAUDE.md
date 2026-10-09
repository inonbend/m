# Form Coach: project context for Claude Code

Read this whole file before changing anything. It describes what the app does,
how it is built, how to run and test it, and what to do next.

## 1. What the product is

Form Coach is a camera-based personal trainer that runs entirely in the browser
on a phone, as an installable offline web app (PWA). The user films themselves
with the phone camera, side-on, and the app:

- tracks 33 body landmarks per frame (Google MediaPipe Pose Landmarker);
- counts reps automatically;
- scores every rep 0–100 against a reference of correct form;
- draws vectors on the live video: bone arrows, joint-angle arcs showing
  "your angle / target angle", and correction arrows pointing where a joint
  should move;
- overlays a green "ghost" skeleton of the correct pose, synced to the user's
  current phase of the rep;
- plays the reference 3D exercise animation picture-in-picture, scrubbed to the
  frame that matches the user's position;
- speaks short coaching cues during and after each rep;
- records sessions (with overlays) and stores them on the device.

References of correct form come from three sources: built-in procedural
animations, videos the user uploads in the Teach tab, and a library of 3D
exercise animations (e.g. the Vital Animations pack, MP4 + JSON metadata)
imported as a ZIP and analyzed by "the brain".

Everything is local: no backend, no accounts, video never leaves the device.

## 2. Current state

The app lives in `app/` (unzipped from the original `form-coach-pwa.zip`; the
repo-root `index.html` is an unrelated Messyma redirect, leave it alone).
It has been tested headless in Chromium with a fake camera, including a full
offline reload: service worker installs, model loads from cache, camera starts,
pose graph runs. It has NOT yet been tested on a real iPhone or Android device.

```
app/
  index.html                  # the app: HTML + CSS + the UI/camera ES module
  src/pose/features.js        # geometry, FEATS, EX, landmarks → joints, record()
  src/brain/segment.js        # smooth, resample, thresholds, segment, repFrom
  src/brain/template.js       # buildTemplate
  src/brain/builtins.js       # fk, MOTION, builtin
  src/brain/dtw.js            # compare (DTW scoring)
  src/brain/names.js          # slug, guessType
  src/brain/track.js          # multi-person tracking in uploaded videos
  src/brain/phase.js          # reference index per frame (for the replay overlays)
  src/pose/roi.js             # automatic crop: find the exerciser in the frame
  src/live/ghost.js           # fitGhost: reference angles on the user's own bone lengths
  sw.js                       # service worker (precache shell, cache-first model)
  manifest.webmanifest
  _headers                    # Netlify / Cloudflare Pages caching + wasm MIME
  README.md                   # user-facing deploy/install guide
  icons/                      # 192, 512, maskable 512, apple-touch 180
  models/pose_landmarker_full.task        # MediaPipe model, Apache 2.0, 9.4 MB
  vendor/jszip.min.js                     # jszip 3.10.1
  vendor/tasks-vision/vision_bundle.mjs   # @mediapipe/tasks-vision 0.10.14
  vendor/tasks-vision/wasm/*              # simd + nosimd wasm builds
```

How the vendor files were obtained (to reproduce or upgrade):

```bash
npm pack @mediapipe/tasks-vision@0.10.14 jszip@3.10.1
# copy vision_bundle.mjs + wasm/* and dist/jszip.min.js into vendor/
# the model is Google's pose_landmarker_full.task (float16, v1):
# https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task
```

The app looks for `./models/pose_landmarker_full.task` first (cache, then HEAD
request) and falls back to the Google URL above.

## 3. UI structure (tabs)

Apple-style "liquid glass" design: system font (-apple-system / SF Pro),
translucent blurred panels (`backdrop-filter: blur(30px) saturate(180%)`),
colorful blurred gradient background, segmented-control tabs, pill buttons,
Apple system colors (blue #0071E3 / #0A84FF, green #30D158, yellow #FFD60A,
red #FF453A), automatic light/dark mode. Media surfaces (camera, videos, ghost
canvases) are always dark (`--media:#0B0D14`). Overlays on video force white
text via a local variable override on `.cue, .stagebar, .startcard`.

1. **Train** (default tab)
   - Exercise pills (Squat, Lunge, Romanian deadlift, Push-up, Bicep curl) and
     a reference dropdown. Order: animation-learned references first
     ("Animation: …"), then "Built-in animation", then user-taught references.
   - Big stage (`.stage.big`, ~78vh desktop, ~74vh phone) holding the canvas.
     A glass start card in the middle has **Start camera** and **Analyze a
     video instead**. When running, a glass bar top-left shows Ready/In rep,
     Stop camera, Record. PiP animation top-right. Coaching cue bottom.
   - Layer toggles: Vectors, Ghost, Animation, Voice, Reset set.
   - Below: rep counter / last / average, "You vs. reference" ghost replay with
     per-rep buttons, rep breakdown meters, "What to fix" list.
2. **Teach**: upload videos of correct form → learn a named reference.
   Shows the learned reference skeleton looping, key angle ranges, a saved
   references list (view, export JSON, delete; import JSON).
3. **Library**: import a ZIP / MP4s / JSON. Search, body-part filter, preview
   video, metadata, instructions, tracking-type select, Learn form, Delete,
   **Analyze all** (batch brain) with stop. Storage usage estimate.
4. **Recordings**: list of saved sessions, playback, stats, Download,
   Analyze again, Delete.

PWA chrome: offline status chip in the header ("Ready offline",
"Offline, ready", "Offline, model not downloaded"), install toast (Android
`beforeinstallprompt`; iOS "Share → Add to Home Screen" hint, dismissible for
3 days), update toast when a new service worker is waiting.

## 4. How the brain works (core algorithms, keep these behaviors)

### 4.1 Landmarks → joints
- MediaPipe indices used, left/right: nose 0; shoulder 11/12; elbow 13/14;
  wrist 15/16; hip 23/24; knee 25/26; ankle 27/28; heel 29/30; toe 31/32.
- Per frame, pick the body side with the higher summed visibility.
- Convert to aspect-correct coordinates: `x = lm.x * (videoWidth/videoHeight)`,
  `y = lm.y`. (Using raw normalized x distorts angles.)
- A frame is rejected if any joint the exercise needs has visibility < 0.5.

### 4.2 Features (degrees)
| key | definition |
|---|---|
| knee | angle(hip, knee, ankle) |
| hip | angle(shoulder, hip, knee) |
| elbow | angle(shoulder, elbow, wrist) |
| torso | lean of shoulder→hip from vertical |
| line | angle(shoulder, hip, ankle), body straightness |
| arm | upper-arm swing, shoulder→elbow from vertical |

### 4.3 Exercises
| key | primary | features | mid-phase label |
|---|---|---|---|
| squat | knee | knee, hip, torso | At the bottom |
| lunge | knee | knee, hip, torso | At the bottom |
| rdl | hip | hip, knee, torso | At the bottom |
| pushup | elbow | elbow, line | At the bottom |
| curl | elbow | elbow, arm, torso | At the top |

All five start with the primary angle high, go low, return high.

### 4.4 Pose normalization (for ghost/animation)
Origin at the hip, scale by torso length (shoulder–hip), flip x so the body
faces +x (facing = sign of toe.x − heel.x). Points stored: nose, shoulder,
elbow, wrist, hip, knee, ankle. Small ghost canvases draw the pose anchored at
the ankle (standing exercises: bottom-center; push-up: bottom-left).
On the video, the ghost is fitted to the user (`fitGhost`): it keeps the
reference's bone directions (its joint angles) but uses the user's own bone
lengths, built outward from the user's ankle (ankle → knee → hip → shoulder →
head, shoulder → elbow → wrist), or from the hip when the feet are out of
frame. A torso-scaled copy drifted off the body whenever limb proportions
differed from the reference.

### 4.5 Rep segmentation
- Smooth the primary signal (moving average, window 5).
- Thresholds from the signal: `hi = max − 0.25·range`, `lo = min + 0.4·range`.
  Require range ≥ 25°.
- State machine: while above `hi` the candidate start is the highest point
  (the local peak); dropping below `lo` arms the rep; after returning above
  `hi` the rep keeps going while the angle still rises and closes at the next
  peak (min 6 frames). Reps therefore run top to top, covering the full range
  like the reference (cutting at the threshold made every user rep look
  "early" and cost ~10 points).
- `segment` returns `[start, end, motionStart, motionEnd]`. The motion span
  (`motionSpan`) leaves out pauses at the top: it starts at the last frame
  still above halfway between the peak and `hi`. `repFrom(recs, feats, ms, me)`
  uses it for `dur`, so tempo measures the movement only. Live mode applies
  the same rules.
- Looping animations often start mid-rep: if no rep is found, append the clip
  to itself and take the first rep found.
- Live mode uses the reference's thresholds (`lo` loosened by +0.1·range).

### 4.6 References (templates)
Each rep is time-normalized to N = 60 samples per feature. A template stores:
`name, exercise, mean[feature][60], std[feature][60] (floor 6°; built-ins 8°),
pose[60][7][2], dur (s), hi, lo, reps[], sources, builtin?, tip?, anim?`.
`anim = {id, t0, t1, loop}` links an animation-derived template to its video
and the rep's time window, so PiP can scrub to the matching frame.
Built-ins are generated at startup and never persisted. User templates are
persisted in `localStorage["fc_templates"]`. Export/import is JSON.

### 4.7 Built-in animations (forward kinematics)
Segment lengths relative to torso = 1: shin 1.05, thigh 1.05, upper arm 0.7,
forearm 0.65, head 0.35. The chain is built from the ankle up (shin → thigh →
torso); arms hang from the shoulder. The push-up solves elbow position with
two-link IK to a fixed wrist on the floor. Keyframes (degrees):

- squat: top {shin 0, thigh 0, torso 5}, bottom {shin 30, thigh −75, torso 40},
  arms forward. Results: knee 180→75, hip 175→65, torso 5→40.
- lunge: bottom {shin 8, thigh −85, torso 5}. Knee 180→87.
- rdl: bottom {shin 12, thigh −15, torso 78}. Hip 180→87, knee 180→153.
- pushup: body line angle 64°→73° from vertical, wrist fixed at (2.84, 0).
  Elbow 176→85.
- curl: forearm 8°→135°. Elbow 175→48 (was 150°/33°: MediaPipe measures a
  full dumbbell curl at ~50°, so good curls were penalized).

Interpolation: `p = (1 − cos(2π·i/(N−1)))/2` (smooth down and up).
Durations: 2.2–3.0 s.

### 4.8 Scoring a rep (DTW)
- DTW between the user's 60-sample rep and the template mean, band width 12.
  Cost = Euclidean distance of per-feature z-scores
  `(user − mean)/std`.
- From the warp path, the signed deviation per feature per reference index.
- Feature score = `clamp(100 − 25·max(0, mean|z| − 0.6))`.
- Tempo score from `ratio = rep.dur / tpl.dur`:
  `clamp(100·(1 − |ln ratio| / ln 2.2))`.
- Overall = 0.85 × (½ mean + ½ worst of the feature scores) + 0.15 × tempo.
  One real fault costs points instead of being averaged away
  (`compare(rep, tpl, {worst})`, default 0.5).
- Tips: for each feature and phase (down 0–23, mid 24–35, up 36–59), flag
  |mean deviation| > 6° and > 1 std. Top 2 by severity become sentences, for
  example "At the bottom, your knee angle is 18° larger than the reference.
  Bend your knees more." Tempo tips if ratio < 0.7 or > 1.5.
- The aligned user pose is kept for the ghost replay.

### 4.9 Live guidance (per camera frame)
- Phase: track the minimum primary value since leaving the top. Ascending once
  it rises 8° above that minimum. Find the closest reference index by primary
  angle within [0, mid] while descending, or [mid, 59] while ascending.
- If the user turns around more than 12° short of the reference bottom, cue
  the primary "+" hint (e.g. "Bend your knees more").
- Other features: |z| > 2.2 for 8 consecutive frames → spoken cue. Cues are
  throttled to one per 2.5 s.
- Draw order: mirrored video → green ghost (reference pose at the current
  index, scaled to the user's torso and anchored at their ankle) → user
  skeleton → vectors (arrows, arcs colored green |z|<1.2, yellow <2.2, red,
  "N° / target M°" labels, correction arrows from the user's joint to the
  ghost joint when |z| ≥ 1.2).
- PiP sync: loops normally when the user is idle; while moving, it pauses and
  sets `currentTime = (t0 + (t1 − t0)·index/59) mod loop`, throttled to one
  seek per 70 ms.

### 4.10 Animation library (IndexedDB)
- Database `formcoach` v1, stores `animations` and `recordings`
  (keyPath `id`).
- Animation record: `{id, name, bodyPart, equipment, target, secondaryMuscles,
  difficulty, category, description, instructions, type, blob, mime, size,
  file, added, templateName, analysis:{status, view, reps, date}}`.
- ZIP import uses JSZip. It skips `__MACOSX` entries and matches videos to JSON
  entries by exerciseId or slugified name. JSON can be an array, `{exercises}`,
  `{data}`, `{items}`, or a single object. The Vital Animations schema:
  `exerciseId, name, bodyPart, equipment, target, secondaryMuscles, difficulty,
  category, description, instructions`.
- Tracking type is guessed from the name:
  lunge/split squat → lunge, squat → squat, deadlift/rdl → rdl,
  push-up → pushup, curl → curl. Otherwise "not supported yet".
- The brain samples frames at 15 fps by seeking. Camera-view detection uses the
  median of shoulder width / torso length: < 0.35 side, > 0.6 front,
  otherwise angled. Statuses: learned; learned, less accurate (front/angled
  view); no complete rep found; no person detected; needs a tracking type.
- License note: Vital Animations paid packs forbid redistributing the raw
  dataset. Never commit their MP4/JSON files to the repo.

### 4.10b Uploaded videos (`processVideo`: Teach, Train "Analyze a video", Library)
Real uploads are often screen recordings (YouTube/TikTok UI around a small
player), filmed at an angle, with more than one person. The pipeline:
1. **Crop** (`src/pose/roi.js`): detect (IMAGE mode, up to 3 poses) on 6 sample
   frames of the full frame. If the needed joints are visible in ≥ 5, keep the
   full frame. Otherwise try bands matching a 16:9 / 4:3 / 1:1 player along the
   long axis plus a 3×3 grid of half-size windows. Pick the crop that sees the
   person in the most frames (ties: more margin from the edges), then pad 8%.
2. **Track** (`src/brain/track.js`): detect up to 3 poses per frame (VIDEO mode
   on the crop), link them by hip position (distance < 0.9 × the largest
   recent torso length, gap ≤ 1 s), keep the track whose primary angle moves
   the most. The detector often alternates between people frame to frame.
3. **3D when not side-on**: every candidate also gets features from MediaPipe
   world landmarks (`features3`) and a side-view pose (`sidePose3`: project
   onto the sagittal plane). If the view (median shoulder width / torso) is not
   "side", these replace the 2D features and pose (`recs.depth`). Example: the
   angled squat shows the knee at ~150° in 2D but ~88° in 3D. Side views keep
   the 2D path. `angle`/`fromVertical` accept an optional `z`.
4. **Replay**: after analysis the stage replays the video (cropped) with
   skeleton, angle arcs/labels and correction arrows, paused at the key point
   of the weakest rep; rep buttons seek; tap to play. The ghost is only drawn
   for side views. Upper-body exercises without visible ankles anchor the ghost
   at the hip (live mode too).
- Delegate: GPU, except when WebGL is software (SwiftShader/llvmpipe, e.g.
  headless or blocklisted GPUs), where CPU is ~3× faster. `?cpu` forces CPU.

### 4.10c Exercise guides ("How to do it")
Train shows a collapsible guide at the bottom of the tab: the animation for the
selected animation reference, else the exercise's default guide, with target
muscles, equipment, difficulty and numbered steps. Push-up and bicep curl have
no animation in the Vital free pack, so they show the built-in skeleton loop and
built-in steps.
- Media is NOT in this repo (Vital license: no redistributing raw files). It is
  hosted at `https://form-coach-guides.vercel.app` (Vercel project
  `form-coach-guides`, account inonbend): `guides.json` + `clips/<id>.mp4|webm`,
  CORS `*`. Built with `node scripts/build-guides.mjs <VitalAnimations dir>
  <out dir>` (transcodes the 11 trackable Free50 clips, learns each reference
  with the app's own brain headless, writes the manifest), then
  `cd <out dir> && vercel deploy --prod`. Free pack ZIP:
  `https://pub-a63d6296f71940e5b51f4f8065d7b660.r2.dev/VitalAnimations/VitalAnimations.zip`.
- The app (`installGuides`) downloads them once when online (MP4 if the browser
  plays H.264, else WebM) into the IndexedDB `animations` store, same records
  as a Library import plus `guide: true|"default"`, and adds the precomputed
  templates, so they are references ("Animation: …") and PiP immediately and
  work offline. `localStorage.fc_guides` holds the manifest version; a new
  version re-syncs. `?guides=<url>` overrides the manifest URL (tests).
- Defaults: squat → dumbbell goblet squat, lunge → barbell reverse lunges,
  rdl → barbell romanian deadlift.

### 4.11 Recording
`MediaRecorder` on `canvas.captureStream(30)`, so overlays are recorded.
The MIME type is the first supported of `video/webm;codecs=vp9`, `video/webm`,
or `video/mp4` (Safari). Stored with exercise, reference, duration, rep count,
scores, average, and the top 3 tips.

### 4.12 Service worker (`sw.js`)
- `VERSION` string controls the shell cache (bump it on every release).
- Precache: index, manifest, JSZip, vision bundle, simd wasm, icons.
- Navigations are network-first with a cached `index.html` fallback.
- `*.task` files are cache-first in a separate `form-coach-model` cache that
  survives app updates.
- Other same-origin requests are cache-first with runtime fill (this covers
  the nosimd wasm on older devices).
- The page warms the model into the cache after the service worker is ready.
  `modelUrl()` checks the cache first, because HEAD requests bypass the
  service worker, which previously broke offline start.

## 5. Constraints and gotchas

- **HTTPS or localhost only.** Camera and service worker both need a secure
  context. `file://` works for the app minus offline/install. A phone on
  `http://192.168.x.x` cannot use the camera. Use Netlify / Cloudflare Pages /
  GitHub Pages, or a tunnel (`npx localtunnel`, `cloudflared`), for phone tests.
- `detectForVideo` needs strictly increasing timestamps across live and
  offline use. Use the shared `nextTs()`.
- The GPU delegate falls back to CPU if creation fails.
- iOS: `playsInline` and `muted` are required on video elements, and speech
  synthesis may need a user gesture first.
- 2D side view only. Knee valgus and other frontal-plane faults are not
  detected yet.
- `index.html` is one large file. That is intentional for the prototype; see
  the refactor plan below.

## 6. Run it

```bash
npm install
npm run serve                      # http-server app -p 8080 -c-1
# open http://localhost:8080
npm test                           # vitest unit tests (tests/unit)
npm run test:e2e                   # playwright e2e (tests/e2e), starts the server itself
FAKE_CAM_Y4M=tests/fixtures/squat_side.y4m npm run test:e2e   # optional real footage
```

`src/*.js` modules are listed in the `sw.js` precache; add new modules there too
and bump `VERSION`.

## 7. Test it

### 7.1 Automated browser tests (Playwright with fake camera)

Set up in `playwright.config.js` / `tests/e2e/`. Tests 1–4 (`app.spec.js`),
5 (`live.spec.js`: rep counting from real footage via the fake camera), 6
(library) and the real-video cases (`cases.spec.js`, section 7.4) are
implemented and passing on a desktop and a phone (390×844) project.
Screenshots land in `screenshots/` (gitignored). Test Chromium has no
H.264/HEVC decoder, so fixtures are VP9 WebM; real phones play MP4/MOV.

Launch Chromium with:

```
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-video-capture=tests/fixtures/squat_side.y4m   # optional: real footage
```

Convert a test clip for the fake camera:
`ffmpeg -i squat_side.mp4 -pix_fmt yuv420p tests/fixtures/squat_side.y4m`

Tests to write (these passed manually in the prototype unless marked new):

1. Page loads with no `pageerror`. The service worker registers and becomes
   active. Caches include `…-shell` and `form-coach-model`.
2. The Train tab is visible by default. `#camBtn` is enabled. `#tplSel` has a
   "Built-in animation" option for every exercise.
3. Click Start camera → `#stagebar` becomes visible and the console logs
   "Graph successfully started running."
4. Offline: `context.setOffline(true)`, reload → the chip reads
   "Offline, ready" and the camera still starts.
5. (new) With the y4m squat clip: after N seconds, `#reps` > 0 and `#last` is
   a number from 0 to 100.
6. (new) Library: import a ZIP fixture with 1 MP4 + JSON (create one yourself
   from any side-view squat clip; don't use licensed Vital files in the repo)
   → the record appears; Analyze all → status "learned" and a new reference
   "Animation: …" appears in Train for Squat.
7. (new) Recording: start camera, Record for 3 s, Stop → the Recordings tab
   lists 1 item with a playable blob.
8. (new) Update flow: bump `VERSION`, reload → the update toast appears →
   clicking Update reloads under the new service worker.
9. Visual: screenshots at 390×844 (phone) and 1280×800 (desktop), light and
   dark. Check that the header does not overlap the stage and cue text is
   white on video.

### 7.2 Unit tests (pure functions; extract them first)
Done: the functions are extracted to `app/src/` (plain ES modules, no build
step yet) and covered by `tests/unit/brain.test.js`.
`angle`, `fromVertical`, `smooth`, `resample`, `thresholds`, `segment`,
`repFrom`, `buildTemplate`, `compare` (DTW), `fk`, `builtin`, `guessType`,
`slug`. Useful checks:

- Built-in squat: knee max ≈ 180, min ≈ 75; hip min ≈ 65.
- `compare(builtinRep, builtinTemplate).score` ≈ 100.
- A rep with knee min 110 against the squat template → low "Knee angle"
  score and a "Bend your knees more" tip at the bottom.
- `segment` on a synthetic 3-rep cosine signal returns 3 reps.
- DTW is robust to a 1.5× time-stretched rep: tempo score drops, feature
  scores stay high.

### 7.4 Real-video cases (local fixtures)
`scripts/prepare-fixtures.sh squat.mov curl_bad.mov curl_good.mov` builds
`tests/fixtures/local/` (gitignored: third-party footage, and the Vital
license forbids redistributing its files). Current results:

| case | video | result |
|---|---|---|
| 1 | good bicep curl, side view (TikTok recording) | 1 rep, 98, "match the reference well" |
| 2 | bad bicep curl, elbow swings forward | 1 rep, ~80, "upper-arm swing 32° larger… Pin your elbow to your side" |
| 3 | bodyweight squat, YouTube screen recording: small, angled, coach next to him | cropped to the player, tracks the squatter, 3D angles, 1 rep, ~90 |
| – | Vital free pack (50 animations): Analyze all | 11 of 11 supported become references (front view, 3D) in ~2.5 min headless |
| – | live camera fed the good curl | one rep per loop, 98–99 |

`tests/e2e/guides.spec.js` serves `tests/fixtures/local/guides-site` (a symlink
to the build-guides output) on :8081.

If `npx playwright install` hangs on a stale `~/Library/Caches/ms-playwright/__dirlock`
(another project's install), use a separate cache:
`PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright-formcoach`.

`scripts/one.mjs`, `scripts/explore.mjs`, `scripts/diag*.mjs`, `scripts/live.mjs`
and `scripts/tune.mjs` are the ad-hoc tools used to get there (see headers).

### 7.3 Real-device checklist
iPhone Safari and installed PWA, Android Chrome and installed PWA: install
flow, camera permission, portrait/landscape, frame rate (target ≥ 20 fps pose
on mid-range phones), voice cues, recording playback (iOS gives mp4),
offline launch in airplane mode, storage persistence after a restart.

## 7.5 Deploy
The repo's `main` branch is served by GitHub Pages (`.nojekyll` keeps every
file as-is), so the app is at `https://inonbend.github.io/m/app/` once merged.

## 8. Suggested refactor (do this first, keep behavior identical)

Move to a small Vite + TypeScript project without a UI framework, which
matches the current vanilla code:

```
src/
  pose/        model.ts (load, nextTs), joints.ts, features.ts
  brain/       segment.ts, template.ts, dtw.ts, builtins.ts, analyzeVideo.ts, analyzeAnimation.ts
  live/        session.ts (phase tracking, cues), draw.ts (skeleton, ghost, vectors), pip.ts
  store/       db.ts (IndexedDB), templates.ts (localStorage), recordings.ts
  ui/          tabs.ts, train.ts, teach.ts, library.ts, recordings.ts, toast.ts
  pwa/         register.ts
  styles/      tokens.css, glass.css
public/        manifest, icons, models/, vendor wasm
sw.ts          (or vite-plugin-pwa / Workbox with the same caching rules)
tests/         unit (vitest), e2e (playwright), fixtures/
```

Rules: keep all processing on-device; no new runtime CDN dependencies; keep
the IndexedDB schema backward compatible (add a DB version migration if it
changes); keep the Apple glass visual language.

## 9. Backlog (after the refactor and tests are green)

1. Front-view mode (knee valgus, hip shift, bar path symmetry), with
   auto-detection of the view from the shoulder-width ratio.
2. Custom exercises: pick the primary joint and features in the UI; save as a
   new exercise type so more library animations become trackable.
3. Progress over time: sessions history, charts of average score and reps per
   exercise, and personal bests.
4. A Web Worker for offline video analysis so the UI stays smooth; optional
   lite model on low-end phones.
5. Better ghost fit: per-user limb-length calibration from a T-pose.
6. Set/rest timer and workout plans using the library metadata (bodyPart,
   equipment, difficulty).
7. Accessibility pass: VoiceOver labels on canvases, captions for voice cues.

## 10. First prompt to give Claude Code

> Read CLAUDE.md. Unzip form-coach-pwa.zip into ./app and serve it locally to
> confirm it runs. Then set up Playwright with a fake camera and write the
> e2e tests in section 7.1 (tests 1–4 first), and make them pass. After that,
> start the refactor in section 8 behind the same tests, extracting the pure
> brain functions first and adding the unit tests from 7.2. Don't change
> behavior or visuals during the refactor. Report what you ran and the results.
