import { afterEach, describe, expect, it, vi } from "vitest";
import { uid } from "@/lib/id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a v4 UUID", () => {
    expect(uid()).toMatch(UUID);
  });

  it("still works where crypto.randomUUID is missing (plain-HTTP LAN address)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const a = uid();
    const b = uid();
    expect(a).toMatch(UUID);
    expect(a).not.toBe(b);
  });
});
