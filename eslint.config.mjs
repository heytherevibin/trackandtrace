import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are separate checkouts with their own lint runs.
    ".claude/**",
    // Generated reports: `npm run test:coverage` and Playwright write these.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Scratch for whoever is running a plan — ledgers, briefs, review packages, and the throwaway
    // scripts that reproduce a defect. Gitignored, so nothing here ships; linting it only means a
    // scratch file can fail `npm run check`, and a gate that fails on scratch is one people learn
    // to wave through.
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
