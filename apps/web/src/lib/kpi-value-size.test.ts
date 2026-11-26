import { describe, expect, it } from "vitest";

import { kpiValueSizeClass } from "./kpi-value-size";

describe("kpiValueSizeClass", () => {
  it("encolhe a fonte conforme o valor formatado cresce", () => {
    expect(kpiValueSizeClass("R$ 1.234,56")).toContain("text-xl");
    expect(kpiValueSizeClass("R$ 12.345,67")).toContain("text-lg");
    expect(kpiValueSizeClass("-R$ 123.456,78")).toContain("text-base");
  });
});
