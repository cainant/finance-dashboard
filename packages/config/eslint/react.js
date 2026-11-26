import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

import { base } from "./base.js";

const hooksConfig =
  reactHooks.configs.flat?.recommended ??
  reactHooks.configs["recommended-latest"] ??
  reactHooks.configs.recommended;

/** @type {import("eslint").Linter.Config[]} */
export const react = [
  ...base,
  {
    name: "@fd/config/react-hooks",
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...hooksConfig.rules },
  },
  {
    name: "@fd/config/react-refresh",
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["Route"] },
      ],
    },
  },
];

export default react;
