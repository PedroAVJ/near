import { describe, expect, it } from "vitest";
import {
  assertEditableMobilePath,
  assertReadablePath,
  slugify,
  visibilityForPath,
} from "../src/policy.js";

describe("Git path policy", () => {
  it("treats every legacy path as confidential", () => {
    expect(visibilityForPath("medical-records/alex/problem-list.md")).toBe("confidential");
    expect(visibilityForPath("public/mobile/a.md")).toBe("public");
  });

  it("rejects confidential and traversal paths in public mode", () => {
    expect(() => assertReadablePath("medical-records/alex/problem-list.md", true)).toThrow(/not public/i);
    expect(() => assertReadablePath("public/../../medical-records/alex/problem-list.md", true)).toThrow(/not valid/i);
    expect(assertReadablePath("public/README.md", true)).toBe("public/README.md");
  });

  it("limits writes to mobile-owned roots", () => {
    expect(assertEditableMobilePath("confidential/mobile/2026/08/note.md")).toContain("confidential/mobile");
    expect(() => assertEditableMobilePath("medical-records/alex/problem-list.md")).toThrow(/iPhone-authored/i);
  });

  it("creates stable readable slugs", () => {
    expect(slugify("Cómo prefiero que me expliques algo")).toBe("como-prefiero-que-me-expliques-algo");
  });
});
