import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  test: {
    environment: "node",
    // Never point integration tests at the developer or production DB by default.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
