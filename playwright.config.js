import {defineConfig} from "@playwright/test";

const fakeCam = process.env.FAKE_CAM_Y4M; // optional: real footage for the fake camera (see CLAUDE.md 7.1)

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: {timeout: 30_000},
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080/",
    browserName: "chromium",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        ...(fakeCam ? [`--use-file-for-fake-video-capture=${fakeCam}`] : []),
      ],
    },
  },
  projects: [
    {name: "desktop", use: {viewport: {width: 1280, height: 900}}},
    {name: "phone", testMatch: /cases|live/, use: {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true}},
  ],
  webServer: {
    command: "npx http-server app -p 8080 -c-1 --silent",
    url: "http://localhost:8080/",
    reuseExistingServer: true,
  },
});
