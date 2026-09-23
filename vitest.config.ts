import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.ui.test.tsx"],
    // Tests select their own API host, independent of local deployment settings.
    env: { VITE_API_URL: "", VITE_API_BASE_URL: "" },
    clearMocks: true,
    // Each full-dashboard jsdom test is CPU intensive on shared Windows hosts.
    // Serial files avoid contention; fake clocks still make polling immediate.
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
