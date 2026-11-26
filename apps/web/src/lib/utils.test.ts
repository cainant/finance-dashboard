import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("mescla classes condicionais", () => {
    const hidden = false;

    expect(cn("px-2", "px-4", hidden && "hidden")).toBe("px-4");
  });
});
