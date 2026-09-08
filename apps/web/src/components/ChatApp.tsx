import { LockKeyhole, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getConversation, listConversations, logout, sendMessage } from "../api";
import { captureClientError, captureProductEvent, resetIdentity } from "../analytics";
import type { Conversation, ConversationMessage, ConversationSummary, Profile } from "../types";
import { Brand } from "./Brand";
import { Composer } from "./Composer";
import { Sidebar } from "./Sidebar";

export function ChatApp({ profile, onLoggedOut }: { profile: Profile; onLoggedOut(): void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState<Conversation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshConversations();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, busy]);

  async function refreshConversations() {
    try {
      const result = await listConversations();
      setConversations(result.conversations);
    } catch (caught) {
      captureClientError(caught, "conversation_list");
    }
  }

  async function selectConversation(id: string) {
    setSidebarOpen(false);
    setError("");
    try {
      const result = await getConversation(id);
      setActive(result.conversation);
    } catch (caught) {
      captureClientError(caught, "conversation_read");
      setError(caught instanceof Error ? caught.message : "Near could not open that conversation.");
    }
  }

  function newConversation() {
    setActive(undefined);
    setSidebarOpen(false);
    setError("");
    captureProductEvent("conversation_started");
  }

  async function handleSend(content: string) {
    const temporary: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setBusy(true);
    setError("");
    setActive((current) => ({
      id: current?.id ?? "pending",
      title: current?.title ?? content.slice(0, 64),
      createdAt: current?.createdAt ?? temporary.createdAt,
      updatedAt: temporary.createdAt,
      messages: [...(current?.messages ?? []), temporary],
    }));
    captureProductEvent("message_sent", { existing_conversation: Boolean(active?.id && active.id !== "pending") });
    try {
      const result = await sendMessage(active?.id === "pending" ? undefined : active?.id, content);
      setActive(result.conversation);
      setConversations((current) => [
        { id: result.conversation.id, title: result.conversation.title, updatedAt: result.conversation.updatedAt },
        ...current.filter((item) => item.id !== result.conversation.id),
      ]);
      captureProductEvent("response_received", { citation_count: result.conversation.messages.at(-1)?.citations?.length ?? 0 });
    } catch (caught) {
      captureClientError(caught, "chat_send");
      setActive((current) => current ? { ...current, messages: current.messages.filter((message) => message.id !== temporary.id) } : current);
      setError(caught instanceof Error ? caught.message : "Near could not answer just now.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      captureProductEvent("signed_out");
      resetIdentity();
      onLoggedOut();
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        profile={profile}
        conversations={conversations}
        selectedId={active?.id}
        onClose={() => setSidebarOpen(false)}
        onNew={newConversation}
        onSelect={(id) => void selectConversation(id)}
        onLogout={() => void handleLogout()}
      />
      <main className="chat-canvas">
        <header className="mobile-header">
          <Brand compact />
          <button onClick={() => setSidebarOpen(true)} aria-label="Open conversations"><Menu aria-hidden="true" /></button>
        </header>
        <section className={active?.messages.length ? "chat-content chat-content--active" : "chat-content"} aria-live="polite">
          {active?.messages.length ? (
            <div className="messages">
              {active.messages.map((message) => <Message key={message.id} message={message} />)}
              {busy ? <div className="thinking" aria-label="Near is thinking"><span /><span /><span /></div> : null}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="empty-state">
              <h1>What’s on your mind?</h1>
              <p>Talk it through. Near will remember what matters.</p>
            </div>
          )}
        </section>
        <div className="composer-region">
          {error ? <p className="chat-error" role="alert">{error}</p> : null}
          <Composer disabled={busy} onSend={handleSend} />
          <p className="privacy-note"><LockKeyhole aria-hidden="true" size={16} />Your Near is private to your account.</p>
        </div>
      </main>
    </div>
  );
}

function Message({ message }: { message: ConversationMessage }) {
  return (
    <article className={message.role === "user" ? "message message--user" : "message message--assistant"}>
      <div className="message__content">{message.content}</div>
      {message.role === "assistant" ? (
        message.citations?.length ? (
          <details className="citations">
            <summary>{message.citations.length === 1 ? "1 record cited" : `${message.citations.length} records cited`}</summary>
            <ul>{message.citations.map((citation) => <li key={`${citation.path}:${citation.commit}`}>{citation.path}</li>)}</ul>
          </details>
        ) : <p className="no-citations">No records cited</p>
      ) : null}
    </article>
  );
}
