import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PrivacyProvider } from "@/components/privacy/privacy-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import { routeTree } from "./routeTree.gen";
import { navTrail } from "./lib/nav-trail";
import { shouldRetryQuery } from "./lib/queries";
import { createViewTransitionOptions, watchPopState } from "./lib/view-transitions";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
  // Melhoria progressiva (só mobile, só com tipos de transição suportados):
  // empurrar ao entrar num detalhe e voltar ao sair; abas trocam sem animação.
  defaultViewTransition: createViewTransitionOptions(),
});

// A trilha de telas alimenta o botão voltar (rótulo e destino pelo histórico).
router.subscribe("onBeforeLoad", ({ fromLocation, toLocation }) => {
  navTrail.record(fromLocation, toLocation);
});
watchPopState();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado em index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <PrivacyProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster />
        </QueryClientProvider>
      </PrivacyProvider>
    </ThemeProvider>
  </StrictMode>,
);
