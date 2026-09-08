import type { Conversation, ConversationSummary, Profile, RuntimeConfig } from "./types";

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
    throw new ApiError(
      payload.error?.message ?? "Near could not complete that request.",
      response.status,
      payload.error?.code ?? "request_failed",
    );
  }
  return (await response.json()) as T;
}

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  return request<RuntimeConfig>("/v1/web/config");
}

export function getSession(): Promise<{ profile: Profile }> {
  return request<{ profile: Profile }>("/v1/web/session");
}

export function requestEmailLink(email: string): Promise<{ accepted: true }> {
  return request<{ accepted: true }>("/v1/auth/email/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function completeEmailLink(email: string, oobCode: string): Promise<{ profile: Profile }> {
  return request<{ profile: Profile }>("/v1/auth/email/complete", {
    method: "POST",
    body: JSON.stringify({ email, oobCode }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/v1/auth/logout", { method: "POST", body: "{}" });
}

export function listConversations(): Promise<{ conversations: ConversationSummary[] }> {
  return request<{ conversations: ConversationSummary[] }>("/v1/conversations");
}

export function getConversation(id: string): Promise<{ conversation: Conversation }> {
  return request<{ conversation: Conversation }>(`/v1/conversations/${encodeURIComponent(id)}`);
}

export function sendMessage(conversationId: string | undefined, message: string): Promise<{ conversation: Conversation }> {
  return request<{ conversation: Conversation }>("/v1/chat", {
    method: "POST",
    body: JSON.stringify({ conversationId, message }),
  });
}
