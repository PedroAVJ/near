import { describe, expect, it } from "vitest";
import { InMemoryIdentityStore } from "../src/identity-store.js";

describe("one-time tenant claims", () => {
  it("binds one Apple subject to one tenant and rejects a second claimant", async () => {
    const store = new InMemoryIdentityStore();
    await expect(store.claimTenant("apple-subject-a", "mom")).resolves.toBe("mom");
    await expect(store.tenantForSubject("apple-subject-a")).resolves.toBe("mom");
    await expect(store.claimTenant("apple-subject-b", "mom")).rejects.toMatchObject({ code: "tenant_claimed" });
  });
});
