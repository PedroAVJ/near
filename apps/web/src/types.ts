export interface Profile {
  id: string;
  displayName: string;
}

export interface RuntimeConfig {
  release: string;
  sentryDsn?: string;
  posthogKey?: string;
  posthogHost?: string;
}

export interface Citation {
  path: string;
  commit: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: Citation[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Conversation extends ConversationSummary {
  createdAt: string;
  messages: ConversationMessage[];
}
