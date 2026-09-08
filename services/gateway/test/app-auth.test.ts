import { describe, expect, it } from "vitest";
import type { NearAnswerer } from "../src/answerer.js";
import { createApp } from "../src/app.js";
import type { GatewayConfig } from "../src/config.js";
import type { EmailLinkAuth } from "../src/email-auth.js";
import type { GitHubRepository } from "../src/github-repository.js";
import { InMemoryIdentityStore } from "../src/identity-store.js";
import type { Tenant } from "../src/types.js";

const tenants: Tenant[] = [
  {
    id: "alex",
    displayName: "Alex",
    repositoryOwner: "example-owner",
    repositoryName: "near-alex",
    branch: "main",
    publicSummary: "Alex's public Near.",
    selfClaimable: true,
  },
  {
    id: "sam",
    displayName: "Sam",
    repositoryOwner: "example-owner",
    repositoryName: "near-sam",
    branch: "main",
    publicSummary: "Sam's public Near.",
    selfClaimable: false,
  },
];

function config(): GatewayConfig {
  return {
    port: 8080,
    appleAudience: "com.alex.Near",
    sessionSecret: new TextEncoder().encode("a-session-secret-that-is-long-enough"),
    githubToken: "github-token",
    firestoreDatabase: "near-ios",
    claudeModel: "sonnet",
    openRouterModel: "moonshotai/kimi-k2.5",
    webOrigin: "https://near.test",
    release: "near@test",
    posthogHost: "https://us.i.posthog.com",
    tenants: new Map(tenants.map((tenant) => [tenant.id, tenant])),
    inviteTenant: () => undefined,
    emailTenant: () => undefined,
  };
}

const emailAuth = {
  sendLink: async () => undefined,
  complete: async () => ({ subjectHash: "email-subject", tenantId: "sam", role: "owner" as const }),
} as unknown as EmailLinkAuth;

function authRequest(claimTenantId: string) {
  return new Request("http://near.test/v1/auth/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identityToken: "i".repeat(100),
      nonce: "n".repeat(16),
      claimTenantId,
    }),
  });
}

describe("beta self-claim", () => {
  it("locks Alex to the first Apple subject and restores that binding", async () => {
    const identities = new InMemoryIdentityStore();
    let subject = "apple-subject-alex";
    const app = createApp({
      config: config(),
      identities,
      repository: {} as GitHubRepository,
      answerer: {} as NearAnswerer,
      emailAuth,
      verifyApple: async () => subject,
    });

    const first = await app.fetch(authRequest("alex"));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ profile: { id: "alex", displayName: "Alex" } });

    const samePersonDifferentChoice = await app.fetch(authRequest("sam"));
    expect(samePersonDifferentChoice.status).toBe(200);
    await expect(samePersonDifferentChoice.json()).resolves.toMatchObject({ profile: { id: "alex" } });

    subject = "another-apple-subject";
    const secondPerson = await app.fetch(authRequest("alex"));
    expect(secondPerson.status).toBe(409);
    await expect(secondPerson.json()).resolves.toMatchObject({ error: { code: "tenant_claimed" } });
  });

  it("does not expose Sam as a first-come beta claim", async () => {
    const app = createApp({
      config: config(),
      identities: new InMemoryIdentityStore(),
      repository: {} as GitHubRepository,
      answerer: {} as NearAnswerer,
      emailAuth,
      verifyApple: async () => "apple-subject-sam",
    });

    const response = await app.fetch(authRequest("sam"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "self_claim_unavailable" } });
  });

  it("lists Sam to Alex without exposing an extra platform tenant", async () => {
    const app = createApp({
      config: config(),
      identities: new InMemoryIdentityStore(),
      repository: {} as GitHubRepository,
      answerer: {} as NearAnswerer,
      emailAuth,
      verifyApple: async () => "apple-subject-alex",
    });

    const authentication = await app.fetch(authRequest("alex"));
    expect(authentication.status).toBe(200);
    const authenticated = await authentication.json() as { accessToken: string; profile: { id: string } };
    expect(authenticated.profile.id).toBe("alex");

    const people = await app.fetch(new Request("http://near.test/v1/people", {
      headers: { Authorization: `Bearer ${authenticated.accessToken}` },
    }));
    expect(people.status).toBe(200);
    const payload = await people.json() as { people: Array<{ id: string }> };
    expect(payload.people.map((person) => person.id)).toEqual(["sam"]);
  });
});
