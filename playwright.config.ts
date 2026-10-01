import { defineConfig } from "@playwright/test";

const exe = process.env.CHROMIUM_PATH || undefined;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", launchOptions: { executablePath: exe } },
  webServer: { command: "npm run build && npx vite preview --port 4173", url: "http://localhost:4173", reuseExistingServer: true, timeout: 120_000 },
});
