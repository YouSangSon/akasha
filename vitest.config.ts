import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
    environment: "node",
    env: {
      LOG_LEVEL: "silent",
    },
  },
});
