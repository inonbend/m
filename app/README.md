# Form Coach — installable web app

A camera-based personal trainer that counts reps, scores your form against
reference animations and coaches you live. Everything runs on the phone:
video never leaves the device.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The app |
| `sw.js` | Service worker: makes the app work offline and handles updates |
| `manifest.webmanifest` | App name, icons and full-screen launch settings |
| `icons/` | Home-screen icons (iPhone, Android, maskable) |
| `vendor/` | MediaPipe pose tracking and JSZip, bundled so no CDN is needed |
| `models/pose_landmarker_full.task` | The pose model (Google MediaPipe, Apache 2.0) |
| `_headers` | Caching and file-type rules for Netlify / Cloudflare Pages |

## Put it online (HTTPS is required for camera + install)

**Netlify (easiest):** go to app.netlify.com/drop and drag this whole folder
onto the page. You get an `https://….netlify.app` link in seconds.

**Cloudflare Pages:** Workers & Pages → Create → Pages → Upload assets →
upload the folder.

**GitHub Pages:** push the folder to a repository, then Settings → Pages →
deploy from branch. Works in a sub-folder path too.

## Install on your phone

- **iPhone / iPad (Safari):** open the link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the link → tap **Install** in the banner, or
  menu → **Install app**.

Open it once while online. After the "Ready offline" label appears in the
header, it works with no connection, including the camera and pose tracking.

## Test on your computer

```bash
cd form-coach-pwa
python3 -m http.server 8080
# open http://localhost:8080 (localhost counts as secure, so the camera works)
```

A phone on your Wi-Fi can't use the camera over plain `http://192.168…`;
use one of the HTTPS hosts above.

## Analyzing a video

Train → **Analyze a video instead** accepts clips from the camera roll,
including screen recordings of YouTube or TikTok. The app finds the person in
the frame, follows the one doing the reps if there are several, and measures
in 3D when the video isn't filmed from the side. Afterwards the video replays
with the angle overlays, paused on your weakest rep; tap it to play. A side
view with the whole body visible still gives the most accurate result.

## Releasing an update

Change `VERSION` at the top of `sw.js` (e.g. `form-coach-v1.0.1`) and
re-upload. Installed apps show "A new version of Form Coach is ready" with an
Update button. The pose model stays cached between versions.

## Where data lives

Animations, references and recordings are stored on the device (IndexedDB)
and the app asks the browser to keep them persistent. Uninstalling the app or
clearing site data deletes them, so export references and download
recordings you want to keep.
