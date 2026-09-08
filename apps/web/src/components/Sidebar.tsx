import { LogOut, MessageCircle, Plus, X } from "lucide-react";
import type { ConversationSummary, Profile } from "../types";
import { Brand } from "./Brand";

interface SidebarProps {
  open: boolean;
  profile: Profile;
  conversations: ConversationSummary[];
  selectedId?: string;
  onClose(): void;
  onNew(): void;
  onSelect(id: string): void;
  onLogout(): void;
}

export function Sidebar({ open, profile, conversations, selectedId, onClose, onNew, onSelect, onLogout }: SidebarProps) {
  return (
    <>
      <button className={open ? "sidebar-scrim sidebar-scrim--open" : "sidebar-scrim"} onClick={onClose} aria-label="Close conversations" tabIndex={open ? 0 : -1} />
      <aside className={open ? "sidebar sidebar--open" : "sidebar"} aria-label="Conversations">
        <div className="sidebar__top">
          <Brand />
          <button className="sidebar__close" onClick={onClose} aria-label="Close conversations"><X aria-hidden="true" /></button>
        </div>
        <button className="new-conversation" onClick={onNew}><Plus aria-hidden="true" size={22} />New conversation</button>
        <div className="sidebar__divider" />
        <h2>Recent</h2>
        <nav className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={conversation.id === selectedId ? "conversation-row conversation-row--selected" : "conversation-row"}
              onClick={() => onSelect(conversation.id)}
            >
              <MessageCircle aria-hidden="true" size={20} />
              <span>{conversation.title}</span>
            </button>
          ))}
        </nav>
        <div className="account-row">
          <div className="account-avatar" aria-hidden="true">{profile.displayName.slice(0, 1).toUpperCase()}</div>
          <span>{profile.displayName}</span>
          <button onClick={onLogout} aria-label="Sign out"><LogOut aria-hidden="true" size={19} /></button>
        </div>
      </aside>
    </>
  );
}
