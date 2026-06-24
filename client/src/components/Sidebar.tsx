import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Board, UserPresence, ChatMessage } from "../types";
import ChatPanel from "./ChatPanel";

interface SidebarProps {
  boards: Board[];
  activeBoardId: string | null;
  onlineUsers: UserPresence[];
  chatMessages: ChatMessage[];
  currentUserId: string;
  unreadCount: number;
  onJoinBoard: (boardId: string, boardName?: string) => void;
  onCreateBoard: () => void;
  onDeleteBoard: (boardId: string) => void;
  onClearBoard: () => void;
  onSendChat: (text: string) => void;
  onChatOpen: () => void;
  onChatClose: () => void;
  activeBoardName: string;
  currentUsername: string;
  connected: boolean;
  themeToggle?: ReactNode;
}

type Tab = "rooms" | "chat" | "users";

const TAB_LABELS: Record<Tab, string> = { rooms: "Rooms", chat: "Chat", users: "Users" };

function Sidebar({
  boards,
  activeBoardId,
  onlineUsers,
  chatMessages,
  currentUserId,
  unreadCount,
  onJoinBoard,
  onCreateBoard,
  onDeleteBoard,
  onClearBoard,
  onSendChat,
  onChatOpen,
  onChatClose,
  activeBoardName,
  currentUsername,
  connected,
  themeToggle,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>("rooms");
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);

  const handleTabChange = (next: Tab) => {
    if (tab === "chat" && next !== "chat") onChatClose();
    setTab(next);
    if (next === "chat") onChatOpen();
  };

  return (
    <aside className="sidebar" aria-label="CollabSpace sidebar">
      {/* Header */}
      <header className="sidebar-header">
        <h2>
          <span className="logo-mark" aria-hidden>✨</span>
          <span className="full-label">CollabSpace</span>
        </h2>
        <div className="sidebar-meta">
          <span
            className={`online-count-dot${connected ? "" : " offline"}`}
            aria-hidden
          />
          <span className="full-label">
            {onlineUsers.length} {onlineUsers.length === 1 ? "user" : "users"} online · {connected ? "Live" : "Offline"}
          </span>
          {themeToggle}
        </div>
      </header>

      {/* Active board banner */}
      {activeBoardId && (
        <div className="current-room-banner">
          <span className="label">Current Room</span>
          <span className="name">
            <span aria-hidden>📘</span>
            <span>{activeBoardName}</span>
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="sidebar-tabs" role="tablist">
        {(["rooms", "chat", "users"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`sidebar-panel-${t}`}
            id={`sidebar-tab-${t}`}
            className={`sidebar-tab${tab === t ? " active" : ""}`}
            onClick={() => handleTabChange(t)}
          >
            <span>{TAB_LABELS[t]}</span>
            {t === "chat" && tab !== "chat" && unreadCount > 0 && (
              <span className="tab-badge" aria-label={`${unreadCount} unread messages`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="sidebar-section">
        <AnimatePresence mode="wait">
          {tab === "rooms" && (
            <motion.div
              key="rooms"
              id="sidebar-panel-rooms"
              role="tabpanel"
              aria-labelledby="sidebar-tab-rooms"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="sidebar-section"
            >
              <div className="sidebar-section-title">All Rooms</div>
              <ul className="room-list" role="list">
                {boards.length === 0 ? (
                  <li className="empty-state">
                    <div className="empty-state-icon" aria-hidden>📋</div>
                    <div>No rooms yet.</div>
                    <div>Create one to begin.</div>
                  </li>
                ) : (
                  boards.map((board) => (
                    <li
                      key={board.id}
                      className={`room-item${activeBoardId === board.id ? " active" : ""}`}
                      onClick={() => onJoinBoard(board.id, board.name)}
                      onMouseEnter={() => setHoveredBoardId(board.id)}
                      onMouseLeave={() => setHoveredBoardId(null)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onJoinBoard(board.id, board.name);
                        }
                      }}
                      aria-current={activeBoardId === board.id ? "page" : undefined}
                    >
                      <span className="room-icon" aria-hidden>
                        {activeBoardId === board.id ? "📘" : "📄"}
                      </span>
                      <span className="room-name">{board.name}</span>
                      {board._count && (
                        <span className="room-count">{board._count.elements}</span>
                      )}
                      {hoveredBoardId === board.id && activeBoardId !== board.id && (
                        <button
                          type="button"
                          className="room-delete"
                          aria-label={`Delete room ${board.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBoard(board.id);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>

              <div className="sidebar-section-actions">
                <button
                  type="button"
                  className="create-room-btn"
                  onClick={onCreateBoard}
                  aria-label="Create new room"
                >
                  <span className="plus" aria-hidden>+</span>
                  <span>New Room</span>
                </button>

                {activeBoardId && (
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => {
                      if (confirm(`Clear all elements on "${activeBoardName}"?`)) {
                        onClearBoard();
                      }
                    }}
                    aria-label={`Clear elements on ${activeBoardName}`}
                  >
                    <span aria-hidden>🗑</span>
                    <span>Clear Canvas</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {tab === "chat" && (
            <motion.div
              key="chat"
              id="sidebar-panel-chat"
              role="tabpanel"
              aria-labelledby="sidebar-tab-chat"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="sidebar-section"
            >
              <ChatPanel messages={chatMessages} currentUserId={currentUserId} onSend={onSendChat} />
            </motion.div>
          )}

          {tab === "users" && (
            <motion.div
              key="users"
              id="sidebar-panel-users"
              role="tabpanel"
              aria-labelledby="sidebar-tab-users"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="sidebar-section"
            >
              <div className="sidebar-section-title">Online Now</div>
              <ul className="presence-list" role="list">
                {onlineUsers.length === 0 ? (
                  <li className="empty-state">
                    <div className="empty-state-icon" aria-hidden>👥</div>
                    <div>No users online.</div>
                    <div>Invite collaborators!</div>
                  </li>
                ) : (
                  onlineUsers.map((user) => (
                    <li key={user.userId} className="presence-user">
                      <div
                        className="presence-avatar"
                        style={{ background: user.color }}
                        aria-hidden
                      >
                        {user.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="presence-name">
                        {user.username}
                        {user.userId === currentUserId && (
                          <span className="self-tag">(you)</span>
                        )}
                      </div>
                      {user.cursor && (
                        <span
                          className="presence-cursor-indicator"
                          style={{ background: user.color }}
                          aria-label="currently editing"
                        />
                      )}
                    </li>
                  ))
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

export default Sidebar;
