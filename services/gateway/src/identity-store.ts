import { FieldValue, Firestore } from "@google-cloud/firestore";
import { GatewayError } from "./errors.js";
import type { IdentityStore } from "./types.js";

export class FirestoreIdentityStore implements IdentityStore {
  private readonly users;
  private readonly claims;

  constructor(firestore = new Firestore()) {
    this.users = firestore.collection("near-ios-users");
    this.claims = firestore.collection("near-ios-tenant-claims");
  }

  async tenantForSubject(subjectHash: string): Promise<string | undefined> {
    const snapshot = await this.users.doc(subjectHash).get();
    const tenantId = snapshot.data()?.tenantId;
    return typeof tenantId === "string" ? tenantId : undefined;
  }

  async claimTenant(subjectHash: string, tenantId: string): Promise<string> {
    return this.users.firestore.runTransaction(async (transaction) => {
      const userRef = this.users.doc(subjectHash);
      const claimRef = this.claims.doc(tenantId);
      const [userSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(claimRef),
      ]);

      const existingTenant = userSnapshot.data()?.tenantId;
      if (typeof existingTenant === "string") return existingTenant;

      const existingSubject = claimSnapshot.data()?.subjectHash;
      if (typeof existingSubject === "string" && existingSubject !== subjectHash) {
        throw new GatewayError(409, "tenant_claimed", "That Near is already linked to another Apple Account.");
      }

      transaction.set(userRef, {
        tenantId,
        createdAt: FirestoreIdentityStore.serverTimestamp(),
      });
      transaction.set(claimRef, {
        subjectHash,
        claimedAt: FirestoreIdentityStore.serverTimestamp(),
      });
      return tenantId;
    });
  }

  async bindTenantIdentity(subjectHash: string, tenantId: string): Promise<string> {
    return this.users.firestore.runTransaction(async (transaction) => {
      const userRef = this.users.doc(subjectHash);
      const claimRef = this.claims.doc(tenantId);
      const userSnapshot = await transaction.get(userRef);
      const existingTenant = userSnapshot.data()?.tenantId;
      if (typeof existingTenant === "string" && existingTenant !== tenantId) {
        throw new GatewayError(409, "identity_bound", "That identity already belongs to another Near.");
      }
      transaction.set(userRef, { tenantId, createdAt: FirestoreIdentityStore.serverTimestamp() }, { merge: true });
      transaction.set(claimRef, {
        subjectHashes: FieldValue.arrayUnion(subjectHash),
        claimedAt: FirestoreIdentityStore.serverTimestamp(),
      }, { merge: true });
      return tenantId;
    });
  }

  private static serverTimestamp() {
    return FieldValue.serverTimestamp();
  }
}

export class InMemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, string>();
  private readonly claims = new Map<string, string>();

  async tenantForSubject(subjectHash: string): Promise<string | undefined> {
    return this.users.get(subjectHash);
  }

  async claimTenant(subjectHash: string, tenantId: string): Promise<string> {
    const existingTenant = this.users.get(subjectHash);
    if (existingTenant) return existingTenant;
    const existingSubject = this.claims.get(tenantId);
    if (existingSubject && existingSubject !== subjectHash) {
      throw new GatewayError(409, "tenant_claimed", "That Near is already linked to another Apple Account.");
    }
    this.users.set(subjectHash, tenantId);
    this.claims.set(tenantId, subjectHash);
    return tenantId;
  }

  async bindTenantIdentity(subjectHash: string, tenantId: string): Promise<string> {
    const existingTenant = this.users.get(subjectHash);
    if (existingTenant && existingTenant !== tenantId) {
      throw new GatewayError(409, "identity_bound", "That identity already belongs to another Near.");
    }
    this.users.set(subjectHash, tenantId);
    return tenantId;
  }
}
