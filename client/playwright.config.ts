import { defineConfig } from "@playwright/test";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const externalBaseURL = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: externalBaseURL || "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: externalBaseURL
    ? []
    : [
        {
          command:
            "uv run --project server uvicorn app.main:app --app-dir server --host 127.0.0.1 --port 8001",
          cwd: root,
          url: "http://127.0.0.1:8001/api/health",
          reuseExistingServer: false,
          env: {
            PRODUCT_ADMIN_STORAGE: path.join(root, ".run", `e2e-${Date.now()}`),
          },
        },
        {
          command: "npm run dev -- --port 5174",
          url: "http://127.0.0.1:5174",
          reuseExistingServer: false,
          env: { API_PROXY_TARGET: "http://127.0.0.1:8001" },
        },
      ],
});
