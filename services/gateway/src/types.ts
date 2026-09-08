export type Visibility = "confidential" | "public";
export type Role = "owner";

export interface Tenant {
  id: string;
  displayName: string;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
  publicSummary: string;
  selfClaimable?: boolean;
  listed?: boolean;
}

export interface SessionIdentity {
  subjectHash: string;
  tenantId: string;
  role: Role;
}

export interface NearFileSummary {
  path: string;
  name: string;
  sha: string;
  size: number;
  visibility: Visibility;
  editable: boolean;
  repositoryCommit: string;
}

export interface NearFile extends NearFileSummary {
  content: string;
}

export interface SavedNearFile {
  id: string;
  path: string;
  visibility: Visibility;
  commit: string;
}

export interface AnswerCitation {
  path: string;
  commit: string;
}

export interface NearAnswer {
  text: string;
  citations: AnswerCitation[];
  provider: "claude-agent-sdk" | "openrouter";
  scope: "private" | "public";
  tenantId: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: AnswerCitation[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation extends ConversationSummary {
  version: 1;
  messages: ConversationMessage[];
}

export interface IdentityStore {
  tenantForSubject(subjectHash: string): Promise<string | undefined>;
  claimTenant(subjectHash: string, tenantId: string): Promise<string>;
  bindTenantIdentity(subjectHash: string, tenantId: string): Promise<string>;
}
