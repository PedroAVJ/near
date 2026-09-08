import { createHash, timingSafeEqual } from "node:crypto";
import { GatewayError } from "./errors.js";
import type { Tenant } from "./types.js";


export interface GatewayConfig {
  port: number;
  appleAudience: string;
  sessionSecret: Uint8Array;
  githubToken: string;
  firestoreDatabase: string;
  claudeModel: string;
  claudeOAuthToken?: string;
  openRouterKey?: string;
  openRouterModel: string;
  webOrigin: string;
  identityApiKey?: string;
  release: string;
  sentryDsn?: string;
  posthogKey?: string;
  posthogHost: string;
  tenants: ReadonlyMap<string, Tenant>;
  inviteTenant(code: string): string | undefined;
  emailTenant(email: string): string | undefined;
}

function parseJson<T>(name: string, value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new GatewayError(500, "invalid_configuration", `${name} is not valid JSON.`);
  }
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const tenants = parseJson<Tenant[]>("NEAR_TENANTS_JSON", env.NEAR_TENANTS_JSON, []);
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  if (tenantMap.size !== tenants.length || tenants.length === 0) {
    throw new GatewayError(500, "invalid_configuration", "NEAR_TENANTS_JSON must configure at least one tenant with unique ids.");
  }

  const inviteHashes = parseJson<Record<string, string>>("NEAR_INVITES_JSON", env.NEAR_INVITES_JSON, {});
  const emailHashes = parseJson<Record<string, string>>("NEAR_EMAIL_TENANTS_JSON", env.NEAR_EMAIL_TENANTS_JSON, {});
  const sessionSecret = env.NEAR_SESSION_SECRET;
  const githubToken = env.NEAR_GITHUB_TOKEN;
  const firestoreDatabase = env.NEAR_FIRESTORE_DATABASE;
  if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
    throw new GatewayError(500, "invalid_configuration", "NEAR_SESSION_SECRET must be at least 32 bytes.");
  }
  if (!githubToken) {
    throw new GatewayError(500, "invalid_configuration", "NEAR_GITHUB_TOKEN is required.");
  }
  if (!firestoreDatabase || firestoreDatabase === "(default)") {
    throw new GatewayError(500, "invalid_configuration", "NEAR_FIRESTORE_DATABASE must select a dedicated database.");
  }

  return {
    port: Number(env.PORT ?? 8080),
    appleAudience: env.NEAR_APPLE_AUDIENCE ?? "com.pedro.Near",
    sessionSecret: new TextEncoder().encode(sessionSecret),
    githubToken,
    firestoreDatabase,
    claudeModel: env.NEAR_CLAUDE_MODEL ?? "sonnet",
    ...(env.CLAUDE_CODE_OAUTH_TOKEN ? { claudeOAuthToken: env.CLAUDE_CODE_OAUTH_TOKEN } : {}),
    ...(env.OPENROUTER_API_KEY ? { openRouterKey: env.OPENROUTER_API_KEY } : {}),
    openRouterModel: env.NEAR_OPENROUTER_MODEL ?? "moonshotai/kimi-k2.5",
    webOrigin: new URL(env.NEAR_WEB_ORIGIN ?? "http://localhost:8080").origin,
    ...(env.NEAR_IDENTITY_API_KEY ? { identityApiKey: env.NEAR_IDENTITY_API_KEY } : {}),
    release: env.NEAR_RELEASE ?? "near@development",
    ...(env.NEAR_SENTRY_DSN ? { sentryDsn: env.NEAR_SENTRY_DSN } : {}),
    ...(env.NEAR_POSTHOG_KEY ? { posthogKey: env.NEAR_POSTHOG_KEY } : {}),
    posthogHost: env.NEAR_POSTHOG_HOST ?? "https://us.i.posthog.com",
    tenants: tenantMap,
    inviteTenant(code: string): string | undefined {
      const candidate = sha256(code.trim());
      for (const [hexHash, tenantId] of Object.entries(inviteHashes)) {
        const expected = Buffer.from(hexHash, "hex");
        if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
          return tenantMap.has(tenantId) ? tenantId : undefined;
        }
      }
      return undefined;
    },
    emailTenant(email: string): string | undefined {
      const key = sha256(`email:${email.trim().toLowerCase()}`).toString("hex");
      const tenantId = emailHashes[key];
      return tenantId && tenantMap.has(tenantId) ? tenantId : undefined;
    },
  };
}
