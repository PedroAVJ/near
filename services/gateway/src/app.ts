import { randomUUID } from "node:crypto";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { issueSession, verifyAppleIdentity, verifySession, verifySessionToken } from "./auth.js";
import type { GatewayConfig } from "./config.js";
import type { EmailLinkAuth } from "./email-auth.js";
import { asGatewayError, GatewayError } from "./errors.js";
import type { SaveRecordInput, GitHubRepository } from "./github-repository.js";
import type { NearAnswerer } from "./answerer.js";
import { Sentry } from "./instrumentation.js";
import type { Conversation, IdentityStore, SessionIdentity } from "./types.js";

type Variables = { identity: SessionIdentity };

export interface AppDependencies {
  config: GatewayConfig;
  identities: IdentityStore;
  repository: GitHubRepository;
  answerer: NearAnswerer;
  emailAuth: EmailLinkAuth;
  serveWeb?: boolean;
  verifyApple?: typeof verifyAppleIdentity;
}

const appleAuthSchema = z.object({
  identityToken: z.string().min(100).max(20_000),
  nonce: z.string().min(16).max(256),
  invitationCode: z.string().min(6).max(128).optional(),
  claimTenantId: z.string().min(1).max(80).optional(),
});

const emailStartSchema = z.object({
  email: z.string().min(3).max(254),
});

const emailCompleteSchema = z.object({
  email: z.string().min(3).max(254),
  oobCode: z.string().min(8).max(4_096),
});

const saveSchema = z.object({
  path: z.string().max(500).optional(),
  id: z.string().uuid().optional(),
  sha: z.string().min(6).max(80).optional(),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(200_000),
  visibility: z.enum(["confidential", "public"]),
});

const deleteSchema = z.object({
  path: z.string().min(1).max(500),
  id: z.string().uuid(),
  sha: z.string().min(6).max(80),
});

const readFileSchema = z.object({ path: z.string().min(1).max(500) });
const publicFilesSchema = z.object({ tenantId: z.string().min(1).max(80) });
const publicFileSchema = publicFilesSchema.extend({ path: z.string().min(1).max(500) });

const askSchema = z.object({
  question: z.string().min(1).max(4_000),
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("own") }),
    z.object({ type: z.literal("public"), tenantId: z.string().min(1).max(80) }),
  ]),
});

const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(8_000),
});

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<{ Variables: Variables }>();
  const verifyApple = dependencies.verifyApple ?? verifyAppleIdentity;

  app.use("*", secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://*.ingest.sentry.io", "https://*.i.posthog.com"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'"],
    },
  }));
  app.use("*", bodyLimit({ maxSize: 300 * 1024 }));
  app.get("/health", (context) => context.json({
    ok: true,
    service: "near-gateway",
    release: dependencies.config.release,
  }));

  app.get("/v1/web/config", (context) => context.json({
    release: dependencies.config.release,
    sentryDsn: dependencies.config.sentryDsn,
    posthogKey: dependencies.config.posthogKey,
    posthogHost: dependencies.config.posthogHost,
  }));

  app.post("/v1/auth/email/start", async (context) => {
    const input = emailStartSchema.parse(await context.req.json());
    await dependencies.emailAuth.sendLink(input.email);
    return context.json({ accepted: true as const }, 202);
  });

  app.post("/v1/auth/email/complete", async (context) => {
    const input = emailCompleteSchema.parse(await context.req.json());
    const identity = await dependencies.emailAuth.complete(input.email, input.oobCode);
    const tenant = ownTenant(dependencies.config, identity);
    const accessToken = await issueSession(dependencies.config, identity, "30d");
    setCookie(context, "near_session", accessToken, {
      httpOnly: true,
      secure: dependencies.config.webOrigin.startsWith("https://"),
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return context.json({ profile: profileFor(tenant) });
  });

  app.post("/v1/auth/logout", (context) => {
    deleteCookie(context, "near_session", { path: "/" });
    return context.json({ ok: true as const });
  });

  app.post("/v1/auth/apple", async (context) => {
    const input = appleAuthSchema.parse(await context.req.json());
    const subjectHash = await verifyApple(input.identityToken, input.nonce, dependencies.config.appleAudience);
    let tenantId = await dependencies.identities.tenantForSubject(subjectHash);
    if (!tenantId) {
      if (input.claimTenantId) {
        const requestedTenant = dependencies.config.tenants.get(input.claimTenantId);
        if (!requestedTenant?.selfClaimable) {
          throw new GatewayError(403, "self_claim_unavailable", "That Near cannot be claimed from this beta.");
        }
        tenantId = await dependencies.identities.claimTenant(subjectHash, requestedTenant.id);
      } else if (input.invitationCode) {
        const invitedTenant = dependencies.config.inviteTenant(input.invitationCode);
        if (!invitedTenant) throw new GatewayError(403, "invalid_invitation", "That Near invitation is not valid.");
        tenantId = await dependencies.identities.claimTenant(subjectHash, invitedTenant);
      } else {
        throw new GatewayError(403, "claim_required", "Choose who is using this Apple Account.");
      }
    }
    const tenant = dependencies.config.tenants.get(tenantId);
    if (!tenant) throw new GatewayError(403, "unknown_tenant", "This Near account is not configured.");
    const accessToken = await issueSession(dependencies.config, { subjectHash, tenantId, role: "owner" });
    return context.json({ accessToken, profile: profileFor(tenant) });
  });

  app.use("/v1/*", async (context, next) => {
    const authorization = context.req.header("Authorization");
    const cookieToken = getCookie(context, "near_session");
    const identity = authorization
      ? await verifySession(dependencies.config, authorization)
      : cookieToken
        ? await verifySessionToken(dependencies.config, cookieToken)
        : await verifySession(dependencies.config, undefined);
    context.set("identity", identity);
    await next();
  });

  app.get("/v1/me", (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    return context.json({ profile: profileFor(tenant) });
  });

  app.get("/v1/web/session", (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    return context.json({ profile: profileFor(tenant) });
  });

  app.get("/v1/conversations", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    return context.json({ conversations: await dependencies.repository.listConversations(tenant) });
  });

  app.get("/v1/conversations/:id", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    return context.json({ conversation: await dependencies.repository.readConversation(tenant, context.req.param("id")) });
  });

  app.post("/v1/chat", async (context) => {
    const input = chatSchema.parse(await context.req.json());
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    const existing = input.conversationId
      ? await dependencies.repository.readConversation(tenant, input.conversationId)
      : undefined;
    const conversationId = existing?.id ?? randomUUID();
    Sentry.logger.info("near.chat.started", {
      tenant_id: tenant.id,
      conversation_id: conversationId,
      model: dependencies.config.openRouterModel,
    });
    const answer = await dependencies.answerer.chat(tenant, existing, input.message);
    const now = new Date().toISOString();
    const conversation: Conversation = {
      version: 1,
      id: conversationId,
      title: existing?.title ?? conversationTitle(input.message),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages: [
        ...(existing?.messages ?? []),
        { id: randomUUID(), role: "user", content: input.message.trim(), createdAt: now },
        {
          id: randomUUID(),
          role: "assistant",
          content: answer.text,
          createdAt: new Date().toISOString(),
          citations: answer.citations,
        },
      ],
    };
    await dependencies.repository.saveConversation(tenant, conversation);
    Sentry.logger.info("near.chat.completed", {
      tenant_id: tenant.id,
      conversation_id: conversationId,
      provider: answer.provider,
      citation_count: answer.citations.length,
    });
    return context.json({ conversation });
  });

  app.get("/v1/files", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    return context.json({ files: await dependencies.repository.listFiles(tenant, false) });
  });

  app.post("/v1/file/read", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    const input = readFileSchema.parse(await context.req.json());
    return context.json({ file: await dependencies.repository.readFile(tenant, input.path, false) });
  });

  app.post("/v1/files", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    const input = saveSchema.parse(await context.req.json()) as SaveRecordInput;
    return context.json({ file: await dependencies.repository.saveRecord(tenant, input) }, 201);
  });

  app.put("/v1/files", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    const input = saveSchema.parse(await context.req.json()) as SaveRecordInput;
    if (!input.path || !input.id || !input.sha) throw new GatewayError(400, "record_identity_required", "That record must be refreshed.");
    return context.json({ file: await dependencies.repository.saveRecord(tenant, input) });
  });

  app.delete("/v1/files", async (context) => {
    const tenant = ownTenant(dependencies.config, context.get("identity"));
    const input = deleteSchema.parse(await context.req.json());
    return context.json({ commit: await dependencies.repository.deleteRecord(tenant, input.path, input.id, input.sha) });
  });

  app.get("/v1/people", (context) => {
    const ownId = context.get("identity").tenantId;
    const people = Array.from(dependencies.config.tenants.values())
      .filter((tenant) => tenant.id !== ownId && tenant.listed !== false)
      .map((tenant) => ({ id: tenant.id, displayName: tenant.displayName, publicSummary: tenant.publicSummary }));
    return context.json({ people });
  });

  app.post("/v1/public/files", async (context) => {
    const input = publicFilesSchema.parse(await context.req.json());
    const tenant = publicTenant(dependencies.config, input.tenantId);
    return context.json({ files: await dependencies.repository.listFiles(tenant, true) });
  });

  app.post("/v1/public/file", async (context) => {
    const input = publicFileSchema.parse(await context.req.json());
    const tenant = publicTenant(dependencies.config, input.tenantId);
    return context.json({ file: await dependencies.repository.readFile(tenant, input.path, true) });
  });

  app.post("/v1/ask", async (context) => {
    const input = askSchema.parse(await context.req.json());
    const identity = context.get("identity");
    if (input.scope.type === "own") {
      const tenant = ownTenant(dependencies.config, identity);
      return context.json({ answer: await dependencies.answerer.answer(tenant, input.question, false) });
    }
    const tenant = publicTenant(dependencies.config, input.scope.tenantId);
    return context.json({ answer: await dependencies.answerer.answer(tenant, input.question, true) });
  });

  if (dependencies.serveWeb) {
    app.use("/*", serveStatic({ root: "./public" }));
    app.get("*", serveStatic({ path: "./public/index.html" }));
  }

  app.notFound((context) => context.json({ error: { code: "not_found", message: "That Near route does not exist." } }, 404));
  app.onError((error, context) => {
    const gatewayError = error instanceof z.ZodError
      ? new GatewayError(400, "invalid_request", "That request is not valid.")
      : asGatewayError(error);
    Sentry.logger.error("near.gateway.request_failed", {
      code: gatewayError.code,
      status: gatewayError.status,
      method: context.req.method,
      route: routeLabel(context.req.path),
    });
    if (gatewayError.status >= 500) Sentry.captureException(error);
    return context.json(
      { error: { code: gatewayError.code, message: gatewayError.message } },
      gatewayError.status as 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500 | 502 | 503,
    );
  });

  return app;
}

function ownTenant(config: GatewayConfig, identity: SessionIdentity) {
  const tenant = config.tenants.get(identity.tenantId);
  if (!tenant) throw new GatewayError(403, "unknown_tenant", "This Near account is not configured.");
  return tenant;
}

function publicTenant(config: GatewayConfig, tenantId: string) {
  const tenant = config.tenants.get(tenantId);
  if (!tenant) throw new GatewayError(404, "person_not_found", "That person is not available in Near.");
  return tenant;
}

function profileFor(tenant: { id: string; displayName: string }) {
  return { id: tenant.id, displayName: tenant.displayName };
}

function conversationTitle(message: string): string {
  const singleLine = message.trim().replace(/\s+/g, " ");
  return singleLine.length <= 64 ? singleLine : `${singleLine.slice(0, 61).trimEnd()}...`;
}

function routeLabel(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").slice(0, 160);
}
