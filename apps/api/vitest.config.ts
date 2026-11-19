import { defineConfig } from "vitest/config";

const base = process.env.DATABASE_URL ?? "postgres://wunschliste:wunschliste@localhost:5432/wunschliste";
const testUrl = base.replace(/\/[^/?]+(\?|$)/, "/wunschliste_test$1");

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: testUrl, APP_URL: "http://localhost:5173", SMTP_HOST: "", NODE_ENV: "test" },
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
