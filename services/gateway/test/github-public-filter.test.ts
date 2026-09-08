import { describe, expect, it } from "vitest";
import { GitHubRepository } from "../src/github-repository.js";
import type { Tenant } from "../src/types.js";

const tenant: Tenant = {
  id: "alex",
  displayName: "Alex",
  repositoryOwner: "example-owner",
  repositoryName: "near-alex",
  branch: "main",
  publicSummary: "Public files.",
};

describe("GitHub public tree filtering", () => {
  it("returns only explicit public paths before any content read", async () => {
    const responses = [
      { object: { sha: "commit-1" } },
      { sha: "commit-1", tree: { sha: "tree-1" } },
      {
        sha: "tree-1",
        truncated: false,
        tree: [
          { path: "public/README.md", mode: "100644", type: "blob", sha: "public-blob", size: 10 },
          { path: "medical-records/alex/problem-list.md", mode: "100644", type: "blob", sha: "private-blob", size: 20 },
        ],
      },
    ];
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } });
    const repository = new GitHubRepository("test-token", fakeFetch);
    const files = await repository.listFiles(tenant, true);
    expect(files.map((file) => file.path)).toEqual(["public/README.md"]);
  });

  it("fails closed when a public caller supplies a confidential path", async () => {
    let fetched = false;
    const fakeFetch: typeof fetch = async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    };
    const repository = new GitHubRepository("test-token", fakeFetch);
    await expect(repository.readFile(tenant, "medical-records/alex/problem-list.md", true)).rejects.toMatchObject({
      code: "confidential_path",
    });
    expect(fetched).toBe(false);
  });
});
