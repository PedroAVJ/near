import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NearAnswerer } from "../src/answerer.js";
import type { GatewayConfig } from "../src/config.js";
import type { MaterializedNear, NearMaterializer } from "../src/materializer.js";
import type { Tenant } from "../src/types.js";

const tenant: Tenant = {
  id: "alex",
  displayName: "Alex",
  repositoryOwner: "example-owner",
  repositoryName: "near-alex",
  branch: "main",
  publicSummary: "Alex's explicitly published Near files.",
};

const config: GatewayConfig = {
  port: 8080,
  appleAudience: "com.alex.Near",
  sessionSecret: new TextEncoder().encode("a-session-secret-that-is-long-enough"),
  githubToken: "github-token",
  firestoreDatabase: "near-ios",
  claudeModel: "sonnet",
  claudeOAuthToken: "claude-oauth-token",
  openRouterModel: "moonshotai/kimi-k2.5",
  webOrigin: "https://near.test",
  release: "near@test",
  posthogHost: "https://us.i.posthog.com",
  tenants: new Map([[tenant.id, tenant]]),
  inviteTenant: () => undefined,
  emailTenant: () => undefined,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("NearAnswerer Claude subscription boundary", () => {
  it("runs a read-only Agent SDK query and filters returned citations", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "near-answerer-test-"));
    await writeFile(path.join(directory, "record.md"), "Alex prefers concise answers.");
    let disposed = false;
    const source: MaterializedNear = {
      directory,
      commit: "abc123",
      allowedPaths: new Set(["record.md"]),
      async dispose() {
        disposed = true;
        await rm(directory, { recursive: true, force: true });
      },
    };
    const materializer = {
      materialize: vi.fn(async () => source),
    } as unknown as NearMaterializer;
    const claudeQuery = vi.fn(async function* (request: {
      options: {
        cwd: string;
        env: Record<string, string | undefined>;
        allowedTools: string[];
        settingSources: string[];
        persistSession: boolean;
        outputFormat: { type: string };
      };
    }) {
      expect(request.options.cwd).toBe(directory);
      expect(request.options.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("claude-oauth-token");
      expect(request.options.env).not.toHaveProperty("ANTHROPIC_API_KEY");
      expect(request.options.env).not.toHaveProperty("OPENAI_API_KEY");
      expect(request.options.env).not.toHaveProperty("NEAR_GITHUB_TOKEN");
      expect(request.options.allowedTools).toEqual(["Read", "Grep", "Glob"]);
      expect(request.options.settingSources).toEqual([]);
      expect(request.options.persistSession).toBe(false);
      expect(request.options.outputFormat.type).toBe("json_schema");
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: {
          answer: "Alex prefers concise answers.",
          citations: ["record.md", "not-allowed.md"],
        },
      };
    });

    const result = await new NearAnswerer(
      config,
      materializer,
      claudeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
    ).answer(tenant, "How should you answer?", false);

    expect(result.provider).toBe("claude-agent-sdk");
    expect(result.citations).toEqual([{ path: "record.md", commit: "abc123" }]);
    expect(disposed).toBe(true);
    expect(claudeQuery).toHaveBeenCalledOnce();
  });
});
