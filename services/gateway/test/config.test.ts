import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const environment = {
  NEAR_SESSION_SECRET: "synthetic-test-session-secret-32-bytes",
  NEAR_GITHUB_TOKEN: "synthetic-test-token",
  NEAR_FIRESTORE_DATABASE: "test-near",
};

describe("operator-owned tenant configuration", () => {
  it("does not select a built-in person when configuration is missing", () => {
    expect(() => loadConfig(environment)).toThrow("NEAR_TENANTS_JSON");
    expect(() => loadConfig({ ...environment, NEAR_TENANTS_JSON: "[]" })).toThrow("NEAR_TENANTS_JSON");
  });

  it("uses only the configured tenant repository", () => {
    const config = loadConfig({
      ...environment,
      NEAR_TENANTS_JSON: JSON.stringify([{
        id: "example", displayName: "Example", repositoryOwner: "example-owner",
        repositoryName: "chosen-context", branch: "notes", publicSummary: "Public notes",
        selfClaimable: false,
      }]),
    });
    expect([...config.tenants.keys()]).toEqual(["example"]);
    expect(config.tenants.get("example")?.repositoryName).toBe("chosen-context");
    expect(config.emailTenant("nobody@example.com")).toBeUndefined();
  });
});
