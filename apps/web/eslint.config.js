import { react } from "@fd/config/eslint/react";

export default [
  ...react,
  {
    // Arquivos de rota do TanStack Router exportam `Route` (não-componente) por
    // design; o aviso de fast-refresh não se aplica.
    name: "@fd/web/tanstack-routes",
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
