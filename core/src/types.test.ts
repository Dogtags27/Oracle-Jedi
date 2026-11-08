import { describe, expect, it } from "vitest";
import { SUITE } from "./index";

describe("core contract", () => {
  it("exposes the crypto suite id", () => {
    expect(SUITE).toBe("HANDOFF-PQ1");
  });
});
