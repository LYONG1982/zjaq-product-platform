import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  reporter: [
    ["list"],
    ["json", { outputFile: "work/round04/browser-results.json" }],
  ],
  outputDir: "work/round04/browser-artifacts",
  workers: 1,
  use: {
    headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    screenshot: "only-on-failure",
  },
});
