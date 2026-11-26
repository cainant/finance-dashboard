import { describe, expect, it } from "vitest";

import { cn } from "./index";

describe("cn", () => {
  it("resolve conflitos de utilitários do Tailwind", () => {
    const hidden = false;

    expect(cn("px-2", "px-4", hidden && "hidden")).toBe("px-4");
  });
});
