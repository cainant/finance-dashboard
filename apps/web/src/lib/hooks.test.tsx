// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./hooks";

function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));

  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useMediaQuery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devolve o valor real já no primeiro render (sem quadro intermediário nulo)", () => {
    stubMatchMedia(false);
    const seen: Array<boolean | null> = [];

    renderHook(() => {
      const value = useMediaQuery("(min-width: 768px)");
      seen.push(value);
      return value;
    });

    expect(seen[0]).toBe(false);
    expect(seen).not.toContain(null);
  });

  it("acompanha a mudança da media query", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it("sem matchMedia (testes em Node) devolve null e não quebra", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBeNull();
  });
});
