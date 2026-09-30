import { defineConfig, devices } from '@playwright/test';

/**
 * End to end configuration.
 *
 * The dev server is started by Playwright itself rather than by hand, so a run
 * never depends on a server somebody remembered to launch, and `reuseExistingServer`
 * keeps a local `pnpm run dev` usable while iterating.
 *
 * Two projects run the same suite against the two viewports the design has to
 * support: a laptop, where the layout options sheet is a side card over a live
 * canvas, and a phone, where every control has to be reachable by thumb.
 */
const PORT = 3000;
// `localhost`, not `127.0.0.1`: Next refuses to serve its dev resources to a
// cross origin host, and the two spellings are different origins to it. The
// page would load and then never hydrate, which looks exactly like a broken
// editor.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // Each test creates its own document in IndexedDB, so they are independent,
  // but a failure in one of them is easier to read in isolation.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // The SVG export test reads the downloaded file, so a download must be
    // allowed rather than silently discarded.
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // The editor needs a document, not a marketing page: a first run visits
    // `/map/<id>` and the route creates the document on open.
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],

  webServer: {
    command: 'pnpm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
