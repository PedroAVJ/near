import { createHash } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import type { GatewayConfig } from "./config.js";
import { GatewayError } from "./errors.js";
import { Sentry } from "./instrumentation.js";
import type { IdentityStore, SessionIdentity } from "./types.js";

interface IdentityResponse {
  email?: string;
  localId?: string;
}

export class EmailLinkAuth {
  private readonly attempts;

  constructor(
    private readonly config: GatewayConfig,
    private readonly identities: IdentityStore,
    firestore: Firestore,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.attempts = firestore.collection("near-web-email-attempts");
  }

  async sendLink(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const tenantId = this.config.emailTenant(normalized);
    if (!tenantId) {
      Sentry.logger.warn("near.auth.email_link_rejected", { reason: "not_invited" });
      return;
    }
    if (!this.config.identityApiKey) {
      throw new GatewayError(503, "email_auth_unavailable", "Email sign-in is temporarily unavailable.");
    }
    const emailHash = sha256Hex(`email:${normalized}`);
    if (!(await this.takeRateLimit(emailHash))) {
      Sentry.logger.warn("near.auth.email_link_rate_limited", { tenant_id: tenantId });
      return;
    }

    const response = await this.fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(this.config.identityApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "EMAIL_SIGNIN",
          email: normalized,
          continueUrl: `${this.config.webOrigin}/auth/finish`,
          canHandleCodeInApp: true,
          clientType: "CLIENT_TYPE_WEB",
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      Sentry.logger.error("near.auth.email_link_failed", { tenant_id: tenantId, dependency_status: response.status });
      throw new GatewayError(503, "email_auth_unavailable", "Email sign-in is temporarily unavailable.");
    }
    Sentry.logger.info("near.auth.email_link_sent", { tenant_id: tenantId });
  }

  async complete(email: string, oobCode: string): Promise<SessionIdentity> {
    const normalized = normalizeEmail(email);
    const tenantId = this.config.emailTenant(normalized);
    if (!tenantId || !this.config.identityApiKey) {
      throw new GatewayError(403, "invitation_required", "That email is not invited to Near.");
    }
    const response = await this.fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${encodeURIComponent(this.config.identityApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, oobCode }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      Sentry.logger.warn("near.auth.email_link_invalid", { tenant_id: tenantId, dependency_status: response.status });
      throw new GatewayError(401, "invalid_email_link", "That sign-in link is invalid or expired.");
    }
    const payload = (await response.json()) as IdentityResponse;
    if (!payload.localId || payload.email?.trim().toLowerCase() !== normalized) {
      throw new GatewayError(401, "invalid_email_identity", "That email identity could not be verified.");
    }
    const subjectHash = sha256Hex(`identity-platform:${payload.localId}`);
    await this.identities.bindTenantIdentity(subjectHash, tenantId);
    Sentry.logger.info("near.auth.email_link_completed", { tenant_id: tenantId });
    return { subjectHash, tenantId, role: "owner" };
  }

  private async takeRateLimit(emailHash: string): Promise<boolean> {
    const reference = this.attempts.doc(emailHash);
    const now = Date.now();
    return reference.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const lastSentAt = snapshot.data()?.lastSentAt;
      if (typeof lastSentAt === "number" && now - lastSentAt < 60_000) return false;
      transaction.set(reference, { lastSentAt: now }, { merge: true });
      return true;
    });
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new GatewayError(400, "invalid_email", "Enter a valid invited email.");
  }
  return normalized;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
