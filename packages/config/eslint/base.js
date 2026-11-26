import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export const base = [
  {
    name: "@fd/config/ignores",
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/routeTree.gen.ts",
      "**/worker-configuration.d.ts",
      "**/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "@fd/config/base",
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
  {
    name: "@fd/config/declarations",
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];

export default base;
