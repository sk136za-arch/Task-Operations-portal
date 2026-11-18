import { defineConfig } from "vitest/config";
import path from "node:path";

// Keep unit tests in Node. The application Vite config contains Cloudflare/RSC
// environments that are intentionally not valid Vitest environments.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
