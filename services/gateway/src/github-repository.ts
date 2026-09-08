import { randomUUID } from "node:crypto";
import path from "node:path";
import { GatewayError } from "./errors.js";
import {
  assertEditableMobilePath,
  assertReadablePath,
  mobileRoot,
  slugify,
  visibilityForPath,
} from "./policy.js";
import { formatRecord, parseRecordMetadata } from "./record-format.js";
import type {
  Conversation,
  ConversationSummary,
  NearFile,
  NearFileSummary,
  SavedNearFile,
  Tenant,
  Visibility,
} from "./types.js";

const conversationRoot = "confidential/web/conversations";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface GitReference {
  object: { sha: string };
}

interface GitCommit {
  sha: string;
  tree: { sha: string };
}

interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

interface GitTree {
  sha: string;
  truncated: boolean;
  tree: GitTreeItem[];
}

interface GitBlob {
  sha: string;
  encoding: "base64" | "utf-8";
  content: string;
  size: number;
}

interface CreatedObject {
  sha: string;
}

interface CommitChange {
  path: string;
  content: string | null;
}

export interface SaveRecordInput {
  path?: string;
  id?: string;
  sha?: string;
  title: string;
  body: string;
  visibility: Visibility;
}

export class GitHubRepository {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listFiles(tenant: Tenant, publicOnly: boolean): Promise<NearFileSummary[]> {
    const { commit, tree } = await this.snapshot(tenant);
    if (tree.truncated) {
      throw new GatewayError(503, "repository_too_large", "This Near tree is temporarily too large to list.");
    }
    return tree.tree
      .flatMap((item): NearFileSummary[] => {
        if (item.type !== "blob") return [];
        try {
          const safePath = assertReadablePath(item.path, publicOnly);
          return [{
            path: safePath,
            name: path.posix.basename(safePath),
            sha: item.sha,
            size: item.size ?? 0,
            visibility: visibilityForPath(safePath),
            editable: safePath.startsWith("public/mobile/") || safePath.startsWith("confidential/mobile/"),
            repositoryCommit: commit.sha,
          }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async readFile(tenant: Tenant, candidatePath: string, publicOnly: boolean): Promise<NearFile> {
    const safePath = assertReadablePath(candidatePath, publicOnly);
    const { commit, tree } = await this.snapshot(tenant);
    const item = tree.tree.find((entry) => entry.type === "blob" && entry.path === safePath);
    if (!item) throw new GatewayError(404, "file_not_found", "That Near file no longer exists.");
    const content = await this.readBlob(tenant, item.sha);
    return {
      path: item.path,
      name: path.posix.basename(item.path),
      sha: item.sha,
      size: item.size ?? Buffer.byteLength(content),
      visibility: visibilityForPath(item.path),
      editable: item.path.startsWith("public/mobile/") || item.path.startsWith("confidential/mobile/"),
      repositoryCommit: commit.sha,
      content,
    };
  }

  async saveRecord(tenant: Tenant, input: SaveRecordInput): Promise<SavedNearFile> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new GatewayError(400, "empty_record", "A title and body are required.");
    if (title.length > 160 || body.length > 200_000) {
      throw new GatewayError(413, "record_too_large", "That record is too large for the iPhone editor.");
    }

    const now = new Date().toISOString();
    let id: string = randomUUID();
    let contributedAt = now;
    let oldPath: string | undefined;
    if (input.path || input.id || input.sha) {
      if (!input.path || !input.id || !input.sha) {
        throw new GatewayError(400, "incomplete_record_identity", "Path, record id, and blob id are required.");
      }
      oldPath = assertEditableMobilePath(input.path);
      const existing = await this.readFile(tenant, oldPath, false);
      if (existing.sha !== input.sha) {
        throw new GatewayError(409, "git_conflict", "That file changed. Refresh and try again.");
      }
      const metadata = parseRecordMetadata(existing.content);
      if (metadata.id !== input.id || metadata.subject !== tenant.id) {
        throw new GatewayError(403, "record_owner_mismatch", "That record does not belong to this Near.");
      }
      id = metadata.id;
      contributedAt = metadata.contributedAt;
    }

    const date = now.slice(0, 10).replace(/-/g, "/");
    const destination = `${mobileRoot(input.visibility)}/${date}/${id}-${slugify(title)}.md`;
    const content = formatRecord(
      {
        id,
        subject: tenant.id,
        visibility: input.visibility,
        contributorClass: "subject",
        contributedAt,
        updatedAt: now,
      },
      title,
      body,
    );
    const changes: CommitChange[] = [{ path: destination, content }];
    if (oldPath && oldPath !== destination) changes.push({ path: oldPath, content: null });
    const action = oldPath ? "update" : "add";
    const commit = await this.commit(tenant, `near(${tenant.id}): ${action} ${destination}`, changes);
    return { id, path: destination, visibility: input.visibility, commit };
  }

  async deleteRecord(tenant: Tenant, candidatePath: string, id: string, expectedSHA: string): Promise<string> {
    const safePath = assertEditableMobilePath(candidatePath);
    const existing = await this.readFile(tenant, safePath, false);
    if (existing.sha !== expectedSHA) {
      throw new GatewayError(409, "git_conflict", "That file changed. Refresh and try again.");
    }
    const metadata = parseRecordMetadata(existing.content);
    if (metadata.id !== id || metadata.subject !== tenant.id) {
      throw new GatewayError(403, "record_owner_mismatch", "That record does not belong to this Near.");
    }
    return this.commit(tenant, `near(${tenant.id}): delete ${safePath}`, [{ path: safePath, content: null }]);
  }

  async listConversations(tenant: Tenant): Promise<ConversationSummary[]> {
    const { tree } = await this.snapshot(tenant);
    if (tree.truncated) throw new GatewayError(503, "repository_too_large", "This Near is temporarily too large to list.");
    const items = tree.tree
      .filter((item) => item.type === "blob" && item.path.startsWith(`${conversationRoot}/`) && item.path.endsWith(".json"))
      .slice(0, 100);
    const conversations = await mapConcurrent(items, 6, async (item) => {
      try {
        return parseConversation(await this.readBlob(tenant, item.sha));
      } catch {
        return undefined;
      }
    });
    return conversations
      .filter((conversation): conversation is Conversation => Boolean(conversation))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 50)
      .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
  }

  async readConversation(tenant: Tenant, id: string): Promise<Conversation> {
    const path = conversationPath(id);
    const { tree } = await this.snapshot(tenant);
    const item = tree.tree.find((entry) => entry.type === "blob" && entry.path === path);
    if (!item) throw new GatewayError(404, "conversation_not_found", "That conversation no longer exists.");
    return parseConversation(await this.readBlob(tenant, item.sha));
  }

  async saveConversation(tenant: Tenant, conversation: Conversation): Promise<string> {
    if (conversation.messages.length > 120) {
      conversation = { ...conversation, messages: conversation.messages.slice(-120) };
    }
    const content = `${JSON.stringify(conversation, null, 2)}\n`;
    if (Buffer.byteLength(content) > 480_000) {
      throw new GatewayError(413, "conversation_too_large", "Start a new conversation to continue.");
    }
    return this.commit(tenant, `near(${tenant.id}): update web conversation ${conversation.id}`, [{
      path: conversationPath(conversation.id),
      content,
    }]);
  }

  async headCommit(tenant: Tenant): Promise<string> {
    return (await this.reference(tenant)).object.sha;
  }

  private async snapshot(tenant: Tenant): Promise<{ commit: GitCommit; tree: GitTree }> {
    const reference = await this.reference(tenant);
    const commit = await this.request<GitCommit>(tenant, "GET", `/git/commits/${reference.object.sha}`);
    const tree = await this.request<GitTree>(tenant, "GET", `/git/trees/${commit.tree.sha}?recursive=1`);
    return { commit, tree };
  }

  private reference(tenant: Tenant): Promise<GitReference> {
    return this.request<GitReference>(tenant, "GET", `/git/ref/heads/${encodeURIComponent(tenant.branch)}`);
  }

  private async readBlob(tenant: Tenant, sha: string): Promise<string> {
    const blob = await this.request<GitBlob>(tenant, "GET", `/git/blobs/${sha}`);
    if (blob.size > 512_000) {
      throw new GatewayError(413, "file_too_large", "That file is too large to open on iPhone.");
    }
    if (blob.encoding === "base64") return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
    return blob.content;
  }

  private async commit(tenant: Tenant, message: string, changes: CommitChange[]): Promise<string> {
    const reference = await this.reference(tenant);
    const baseCommit = await this.request<GitCommit>(tenant, "GET", `/git/commits/${reference.object.sha}`);
    const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];
    for (const change of changes) {
      const safePath = normalizeMutationPath(change.path);
      if (change.content === null) {
        entries.push({ path: safePath, mode: "100644", type: "blob", sha: null });
      } else {
        const blob = await this.request<CreatedObject>(tenant, "POST", "/git/blobs", {
          content: change.content,
          encoding: "utf-8",
        });
        entries.push({ path: safePath, mode: "100644", type: "blob", sha: blob.sha });
      }
    }
    const tree = await this.request<CreatedObject>(tenant, "POST", "/git/trees", {
      base_tree: baseCommit.tree.sha,
      tree: entries,
    });
    const commit = await this.request<CreatedObject>(tenant, "POST", "/git/commits", {
      message,
      tree: tree.sha,
      parents: [reference.object.sha],
    });
    await this.request<GitReference>(tenant, "PATCH", `/git/refs/heads/${encodeURIComponent(tenant.branch)}`, {
      sha: commit.sha,
      force: false,
    });
    return commit.sha;
  }

  private async request<T>(tenant: Tenant, method: string, suffix: string, body?: unknown): Promise<T> {
    const owner = encodeURIComponent(tenant.repositoryOwner);
    const repository = encodeURIComponent(tenant.repositoryName);
    const response = await this.fetcher(`https://api.github.com/repos/${owner}/${repository}${suffix}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "near-gateway/0.8",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      if (response.status === 404) throw new GatewayError(404, "repository_not_found", "That Near repository is unavailable.");
      if (response.status === 409 || response.status === 422) {
        throw new GatewayError(409, "git_conflict", "The repository changed. Refresh and try again.");
      }
      throw new GatewayError(502, "github_unavailable", "Near could not reach its Git repository.");
    }
    return (await response.json()) as T;
  }
}

function normalizeMutationPath(candidate: string): string {
  const normalized = assertReadablePath(candidate, false);
  if (
    !normalized.startsWith("public/mobile/")
    && !normalized.startsWith("confidential/mobile/")
    && !normalized.startsWith(`${conversationRoot}/`)
  ) {
    throw new GatewayError(403, "record_read_only", "That interface cannot write this path.");
  }
  return normalized;
}

function conversationPath(id: string): string {
  if (!uuidPattern.test(id)) throw new GatewayError(400, "invalid_conversation", "That conversation id is invalid.");
  return `${conversationRoot}/${id}.json`;
}

function parseConversation(content: string): Conversation {
  try {
    const value = JSON.parse(content) as Partial<Conversation>;
    if (
      value.version !== 1
      || typeof value.id !== "string"
      || !uuidPattern.test(value.id)
      || typeof value.title !== "string"
      || typeof value.createdAt !== "string"
      || typeof value.updatedAt !== "string"
      || !Array.isArray(value.messages)
    ) {
      throw new Error("invalid conversation");
    }
    return value as Conversation;
  } catch {
    throw new GatewayError(500, "invalid_conversation_record", "That conversation record is invalid.");
  }
}

async function mapConcurrent<T, U>(items: T[], concurrency: number, action: (item: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) output[index] = await action(item);
    }
  }));
  return output;
}
