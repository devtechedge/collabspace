import { useState } from "react";
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
  onSendChat: (text: string) => void;
  onChatOpen: () => void;
}

type Tab = "rooms" | "chat" | "users";

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
  onSendChat,
  onChatOpen,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>("rooms");
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);

  const handleTabChange = (next: Tab) => {
    setTab(next);
    if (next === "chat") onChatOpen();
  };

  return (
    <motion.aside
      className="sidebar"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.05 }}
    >
      {/* Header */}
      <div className="sidebar-header">
        <h2>
          <span className="logo-dot" />
          CollabSpace
        </h2>
        <p>
          <span className="online-count-dot" />
          {onlineUsers.length} {onlineUsers.length === 1 ? "user" : "users"} online
        </p>
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === "rooms" ? "active" : ""}`}
          onClick={() => handleTabChange("rooms")}
        >
          Rooms
        </button>
        <button
          className={`sidebar-tab ${tab === "chat" ? "active" : ""}`}
          onClick={() => handleTabChange("chat")}
        >
          Chat
          {tab !== "chat" && unreadCount > 0 && (
            <span className="tab-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          )}
        </button>
        <button
          className={`sidebar-tab ${tab === "users" ? "active" : ""}`}
          onClick={() => handleTabChange("users")}
        >
          Users
        </button>
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {tab === "rooms" && (
          <motion.div
            key="rooms"
            className="sidebar-section"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <span className="sidebar-section-title">All Rooms</span>
            <ul className="room-list">
              <AnimatePresence initial={false}>
                {boards.length === 0 && (
                  <motion.li
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="empty-state-icon">📋</div>
                    <div>No rooms yet.<br />Create one to begin.</div>
                  </motion.li>
                )}
                {boards.map((board, i) => (
                  <motion.li
                    key={board.id}
                    className={`room-item ${activeBoardId === board.id ? "active" : ""}`}
                    onClick={() => onJoinBoard(board.id, board.name)}
                    onMouseEnter={() => setHoveredBoardId(board.id)}
                    onMouseLeave={() => setHoveredBoardId(null)}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ delay: i * 0.04, type: "spring", stiffness: 280, damping: 22 }}
                    whileHover={{ x: 2 }}
                    layout
                  >
                    <span className="room-icon">
                      {activeBoardId === board.id ? "📘" : "📄"}
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {board.name}
                    </span>
                    {board._count && (
                      <span className="room-count">{board._count.elements}</span>
                    )}
                    <AnimatePresence>
                      {hoveredBoardId === board.id && activeBoardId !== board.id && (
                        <motion.button
                          className="room-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBoard(board.id);
                          }}
                          title="Delete board"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          whileHover={{ scale: 1.15 }}
                        >
                          ✕
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <motion.button
              className="create-room-btn"
              onClick={onCreateBoard}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="plus">+</span> New Room
            </motion.button>
          </motion.div>
        )}

        {tab === "chat" && (
          <motion.div
            key="chat"
            className="sidebar-section"
            style={{ padding: 0, display: "flex", flexDirection: "column" }}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ChatPanel
              messages={chatMessages}
              currentUserId={currentUserId}
              onSend={onSendChat}
            />
          </motion.div>
        )}

        {tab === "users" && (
          <motion.div
            key="users"
            className="sidebar-section"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <span className="sidebar-section-title">Online Now</span>
            <ul className="presence-list">
              <AnimatePresence initial={false}>
                {onlineUsers.length === 0 && (
                  <motion.li
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="empty-state-icon">👥</div>
                    <div>No users online.<br />Invite collaborators!</div>
                  </motion.li>
                )}
                {onlineUsers.map((user, i) => (
                  <motion.li
                    key={user.userId}
                    className="presence-user"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 280, damping: 22 }}
                    whileHover={{ x: -2 }}
                    layout
                  >
                    <div
                      className="presence-avatar"
                      style={{ backgroundColor: user.color }}
                      title={user.userId}
                    >
                      {user.username.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="presence-name">{user.username}</span>
                    {user.cursor && (
                      <motion.span
                        className="presence-cursor-indicator"
                        style={{ backgroundColor: user.color }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

export default Sidebar;
