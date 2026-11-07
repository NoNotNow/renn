/**
 * Production-build device-parity config for the touch camera specs.
 *
 * Unlike the default playwright.config.ts (dev server + desktop viewport), this serves the
 * real `vite build` output via `vite preview` — the artifact the phone loads from gh-pages —
 * in phone-emulated viewports:
 * - `mobile-chromium` runs the CDP multitouch gesture specs (Input.dispatchTouchEvent).
 * - `mobile-webkit` runs the layout diagnostics under the iOS engine (iPhone descriptors
 *   default to WebKit) — CDP multitouch is Chromium-only.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: /touch-camera-mobile\.spec\.ts/,
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/renn/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
