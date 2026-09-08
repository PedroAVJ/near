import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { GatewayError } from "./errors.js";
import type { GatewayConfig } from "./config.js";
import type { SessionIdentity } from "./types.js";

const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function verifyAppleIdentity(
  identityToken: string,
  rawNonce: string,
  audience: string,
): Promise<string> {
  try {
    const { payload } = await jwtVerify(identityToken, appleKeys, {
      issuer: "https://appleid.apple.com",
      audience,
      algorithms: ["RS256"],
    });
    if (!payload.sub || typeof payload.nonce !== "string") {
      throw new GatewayError(401, "invalid_apple_identity", "Apple identity is incomplete.");
    }
    if (payload.nonce !== sha256Hex(rawNonce)) {
      throw new GatewayError(401, "invalid_apple_nonce", "Apple sign-in could not be verified.");
    }
    return sha256Hex(payload.sub);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(401, "invalid_apple_identity", "Apple sign-in could not be verified.");
  }
}

export async function issueSession(
  config: GatewayConfig,
  identity: SessionIdentity,
  lifetime: "7d" | "30d" = "7d",
): Promise<string> {
  return new SignJWT({ tenantId: identity.tenantId, role: identity.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("near-gateway")
    .setAudience(config.appleAudience)
    .setSubject(identity.subjectHash)
    .setIssuedAt()
    .setExpirationTime(lifetime)
    .sign(config.sessionSecret);
}

export async function verifySession(
  config: GatewayConfig,
  authorization: string | undefined,
): Promise<SessionIdentity> {
  if (!authorization?.startsWith("Bearer ")) {
    throw new GatewayError(401, "missing_session", "Sign in to continue.");
  }
  return verifySessionToken(config, authorization.slice("Bearer ".length));
}

export async function verifySessionToken(
  config: GatewayConfig,
  token: string,
): Promise<SessionIdentity> {
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, {
      algorithms: ["HS256"],
      issuer: "near-gateway",
      audience: config.appleAudience,
    });
    if (
      !payload.sub ||
      typeof payload.tenantId !== "string" ||
      payload.role !== "owner" ||
      !config.tenants.has(payload.tenantId)
    ) {
      throw new Error("invalid claims");
    }
    return {
      subjectHash: payload.sub,
      tenantId: payload.tenantId,
      role: "owner",
    };
  } catch {
    throw new GatewayError(401, "invalid_session", "Sign in again to continue.");
  }
}
