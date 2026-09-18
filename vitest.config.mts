import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: pure logic under node, components under jsdom.
// File extension decides the environment: *.test.ts → node, *.test.tsx → jsdom.
export default defineConfig({
  plugins: [react()],
  // The one path alias in tsconfig.json (`@/*` → `src/*`), resolved without a plugin.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/services/**", "src/utils/**", "src/app/api/**", "src/app/auth/**"],
      exclude: ["src/types/supabase.ts"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
});
