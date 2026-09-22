import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";
import { defineConfig } from "eslint/config";

export default defineConfig([
  globalIgnores([".delta", "dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["worker-configuration.d.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "react-refresh/only-export-components": [
        "error",
        {
          allowConstantExport: true,
          extraHOCs: ["createFileRoute", "createRootRoute"],
        },
      ],
    },
  },
]);
