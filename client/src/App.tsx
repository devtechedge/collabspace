import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import DrawingBoard from "./components/DrawingBoard";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import Toasts, { ToastItem } from "./components/Toasts";
import {
  CanvasElement,
  Tool,
  Board,
  UserPresence,
  HistoryAction,
  ChatMessage,
  Reaction,
  LaserPointer,
} from "./types";

const SOCKET_URL = "http://localhost:5000";

// Default sticky palette (kept here for reaction spawning fallback)
const CANVAS_CENTER_FALLBACK = { x: 400, y: 300 };

function App() {
  // ─── Core State ──────────────────────────────────────────────────
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // ─── Identity ────────────────────────────────────────────────────
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUsername, setCurrentUsername] = useState<string>("");

  // ─── Board State ─────────────────────────────────────────────────
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeBoardName, setActiveBoardName] = useState<string>("CollabSpace");

  // ─── Canvas State ────────────────────────────────────────────────
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("PENCIL");
  const [activeColor, setActiveColor] = useState<string>("#ffffff");
  const [activeFontWeight, setActiveFontWeight] = useState<string>("normal");

  // ─── Presence State ──────────────────────────────────────────────
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);

  // ─── Chat State ──────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatTabOpenRef = useRef(false);

  // ─── Reactions State ─────────────────────────────────────────────
  const [reactions, setReactions] = useState<Reaction[]>([]);

  // ─── Laser Pointers State ────────────────────────────────────────
  const [laserPointers, setLaserPointers] = useState<LaserPointer[]>([]);
  const laserEmitTimeoutRef = useRef<number | null>(null);

  // ─── Toasts ──────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((text: string, type: ToastItem["type"] = "info") => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Welcome Toast ───────────────────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(true);

  // ─── Undo/Redo ──────────────────────────────────────────────────
  const undoStackRef = useRef<HistoryAction[]>([]);
  const redoStackRef = useRef<HistoryAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const refreshCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  // ─── Initialize Socket ──────────────────────────────────────────
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    newSocket.on("connect", () => {
      console.log("[Socket] Connected:", newSocket.id);
      setConnected(true);
      pushToast("Connected to CollabSpace", "success");
    });

    newSocket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      setConnected(false);
      pushToast("Disconnected — attempting to reconnect…", "danger");
    });

    // Receive identity from server
    newSocket.on("identity", (data: { userId: string; username: string; color: string }) => {
      setCurrentUserId(data.userId);
      setCurrentUsername(data.username);
    });

    // Canvas history received when joining a room
    newSocket.on("canvas-history", (history: CanvasElement[]) => {
      console.log("[Socket] Canvas history received:", history.length, "elements");
      setElements(history);
      undoStackRef.current = [];
      redoStackRef.current = [];
      refreshCounts();
    });

    // Real-time element updates from peers
    newSocket.on("element-update", (element: CanvasElement) => {
      setElements((prev) => {
        const idx = prev.findIndex((e) => e.id === element.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = element;
          return next;
        }
        return [...prev, element];
      });
    });

    // Element deleted by peer
    newSocket.on("element-delete", (elementId: string) => {
      setElements((prev) => prev.filter((e) => e.id !== elementId));
    });

    // Presence updates
    newSocket.on("presence-update", (users: UserPresence[]) => {
      setOnlineUsers(users);
    });

    // Board cleared by peer
    newSocket.on("canvas-cleared", () => {
      setElements([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      refreshCounts();
      pushToast("Board was cleared by a collaborator", "warning");
    });

    // ─── Chat Events ─────────────────────────────────────────────
    newSocket.on("chat-history", (messages: ChatMessage[]) => {
      setChatMessages(messages);
    });

    newSocket.on("chat-message", (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
      // Increment unread if chat tab not open and message is from someone else
      if (!chatTabOpenRef.current && message.userId !== currentUserId) {
        setUnreadChatCount((c) => c + 1);
      }
    });

    // ─── Reaction Events ─────────────────────────────────────────
    newSocket.on("reaction-burst", (reaction: Reaction) => {
      setReactions((prev) => [...prev, reaction]);
      // Auto-remove after 3s
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 3000);
    });

    // ─── Laser Pointer Events ────────────────────────────────────
    newSocket.on("laser-pointer", (data: LaserPointer) => {
      setLaserPointers((prev) => {
        const filtered = prev.filter((p) => p.userId !== data.userId);
        if (data.active) {
          return [...filtered, data];
        }
        return filtered;
      });
      // Auto-expire after 1.4s of inactivity (safety net)
      setTimeout(() => {
        setLaserPointers((prev) => prev.filter((p) => p.userId !== data.userId));
      }, 1500);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [pushToast, refreshCounts, currentUserId]);

  // ─── Fetch Boards from API ──────────────────────────────────────
  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      const data = await res.json();
      setBoards(data);
    } catch (err) {
      console.error("Failed to fetch boards:", err);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  // ─── Auto-select first board ────────────────────────────────────
  useEffect(() => {
    if (boards.length > 0 && !activeBoardId) {
      handleJoinBoard(boards[0].id, boards[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, activeBoardId]);

  // ─── Board Operations ───────────────────────────────────────────
  const handleJoinBoard = useCallback(
    (boardId: string, boardName?: string) => {
      setActiveBoardId(boardId);
      setActiveBoardName(boardName || "Untitled Board");
      socket?.emit("join-room", boardId);
      setUnreadChatCount(0);
    },
    [socket]
  );

  const handleCreateBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Board ${boards.length + 1}` }),
      });
      const newBoard = await res.json();
      setBoards((prev) => [newBoard, ...prev]);
      handleJoinBoard(newBoard.id, newBoard.name);
      pushToast(`Created "${newBoard.name}"`, "success");
    } catch (err) {
      console.error("Failed to create board:", err);
      pushToast("Failed to create board", "danger");
    }
  }, [boards.length, handleJoinBoard, pushToast]);

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      try {
        await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
        const updatedBoards = boards.filter((b) => b.id !== boardId);
        setBoards(updatedBoards);
        if (activeBoardId === boardId) {
          if (updatedBoards.length > 0) {
            handleJoinBoard(updatedBoards[0].id, updatedBoards[0].name);
          } else {
            setActiveBoardId(null);
            setActiveBoardName("CollabSpace");
            setElements([]);
            handleCreateBoard();
          }
        }
        pushToast("Board deleted", "info");
      } catch (err) {
        console.error("Failed to delete board:", err);
        pushToast("Failed to delete board", "danger");
      }
    },
    [boards, activeBoardId, handleJoinBoard, handleCreateBoard, pushToast]
  );

  // ─── Drawing Operations ─────────────────────────────────────────
  const handleDrawElement = useCallback(
    (element: CanvasElement) => {
      setElements((prev) => {
        const idx = prev.findIndex((e) => e.id === element.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = element;
          return next;
        }
        return [...prev, element];
      });
      socket?.emit("draw-element", element);
    },
    [socket]
  );

  const handleDeleteElement = useCallback(
    (elementId: string) => {
      setElements((prev) => prev.filter((e) => e.id !== elementId));
      socket?.emit("delete-element", elementId);
    },
    [socket]
  );

  const handleClearBoard = useCallback(() => {
    setElements([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
    refreshCounts();
    socket?.emit("clear-board");
    pushToast("Board cleared", "info");
  }, [socket, refreshCounts, pushToast]);

  // ─── Undo/Redo ──────────────────────────────────────────────────
  const pushUndo = useCallback(
    (action: HistoryAction) => {
      undoStackRef.current.push(action);
      // Limit stack size
      if (undoStackRef.current.length > 100) {
        undoStackRef.current.shift();
      }
      // Clear redo on new action
      redoStackRef.current = [];
      refreshCounts();
    },
    [refreshCounts]
  );

  const handleUndo = useCallback(() => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    refreshCounts();

    redoStackRef.current.push(action);

    if (action.type === "ADD") {
      // Undo an add = delete the element
      setElements((prev) => prev.filter((e) => e.id !== action.element.id));
      socket?.emit("element-revert", { ...action.element, _deleted: true });
    } else if (action.type === "DELETE") {
      // Undo a delete = restore the element
      setElements((prev) => [...prev, action.element]);
      socket?.emit("draw-element", action.element);
    } else if (action.type === "MODIFY" && action.previousState) {
      // Undo a modify = restore previous state
      setElements((prev) =>
        prev.map((e) =>
          e.id === action.previousState!.id ? action.previousState! : e
        )
      );
      socket?.emit("element-revert", action.previousState);
    }
  }, [socket, refreshCounts]);

  const handleRedo = useCallback(() => {
    const action = redoStackRef.current.pop();
    if (!action) return;
    refreshCounts();

    undoStackRef.current.push(action);

    if (action.type === "ADD") {
      setElements((prev) => [...prev, action.element]);
      socket?.emit("draw-element", action.element);
    } else if (action.type === "DELETE") {
      setElements((prev) => prev.filter((e) => e.id !== action.element.id));
      socket?.emit("element-revert", { ...action.element, _deleted: true });
    } else if (action.type === "MODIFY" && action.element) {
      setElements((prev) =>
        prev.map((e) => (e.id === action.element.id ? action.element : e))
      );
      socket?.emit("element-revert", action.element);
    }
  }, [socket, refreshCounts]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in text input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      const keyMap: Record<string, Tool> = {
        v: "SELECT",
        p: "PENCIL",
        l: "LINE",
        r: "RECTANGLE",
        c: "CIRCLE",
        t: "TEXT",
        e: "ERASER",
        n: "STICKY",
        x: "LASER",
      };

      const tool = keyMap[e.key.toLowerCase()];
      if (tool) {
        setActiveTool(tool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ─── Cursor Move (called from DrawingBoard) ─────────────────────
  const handleCursorMove = useCallback(
    (position: { x: number; y: number }) => {
      socket?.emit("cursor-move", position);
    },
    [socket]
  );

  // ─── Laser Pointer Move (broadcasts to peers) ───────────────────
  const handleLaserMove = useCallback(
    (position: { x: number; y: number } | null) => {
      if (!socket) return;
      if (position) {
        socket.emit("laser-pointer", { x: position.x, y: position.y, active: true });
        // Schedule a "deactivate" emit after 800ms of no movement
        if (laserEmitTimeoutRef.current) {
          clearTimeout(laserEmitTimeoutRef.current);
        }
        laserEmitTimeoutRef.current = window.setTimeout(() => {
          socket.emit("laser-pointer", { x: 0, y: 0, active: false });
        }, 800);
      } else {
        if (laserEmitTimeoutRef.current) {
          clearTimeout(laserEmitTimeoutRef.current);
        }
        socket.emit("laser-pointer", { x: 0, y: 0, active: false });
      }
    },
    [socket]
  );

  // ─── Chat Send ──────────────────────────────────────────────────
  const handleSendChat = useCallback(
    (text: string) => {
      socket?.emit("send-chat", text);
    },
    [socket]
  );

  // ─── Chat Open (clears unread badge) ────────────────────────────
  const handleChatOpen = useCallback(() => {
    chatTabOpenRef.current = true;
    setUnreadChatCount(0);
  }, []);

  // Keep chatTabOpenRef synced with sidebar visibility (always visible here,
  // so chat tab IS open from the user's perspective once they click it)
  useEffect(() => {
    // Default: chat tab not open. When user clicks Chat tab, handleChatOpen fires.
    // For simplicity, we treat "open" as "user has clicked chat at least once."
  }, []);

  // ─── Send Reaction ──────────────────────────────────────────────
  const handleSendReaction = useCallback(
    (emoji: string) => {
      if (!socket) return;
      // Spawn at center of current viewport (canvas coords)
      // We don't have direct access to viewport here, but DrawingBoard handles
      // the visual rendering based on the canvas position. Spawn near a
      // visible area: use a default if we can't introspect.
      const x = CANVAS_CENTER_FALLBACK.x + Math.random() * 200 - 100;
      const y = CANVAS_CENTER_FALLBACK.y + Math.random() * 100 - 50;
      socket.emit("send-reaction", { emoji, x, y });
    },
    [socket]
  );

  // ─── Export PNG ──────────────────────────────────────────────────
  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `collabspace-${activeBoardName.replace(/\s+/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    pushToast("Board exported as PNG", "success");
  }, [activeBoardName, pushToast]);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Top Bar */}
      <motion.div
        className="top-bar"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 }}
      >
        <div className="top-bar-logo">
          <span className="logo-emoji">🎨</span>
          Collab<span>Space</span>
        </div>
        <div className="top-bar-divider" />
        <div className="top-bar-board-name" title={activeBoardName}>
          {activeBoardName}
        </div>
        <div className="top-bar-divider" />
        <div className="top-bar-actions">
          <button
            className="top-bar-btn"
            onClick={handleExportPNG}
            title="Export current view as PNG"
          >
            ⬇ Export
          </button>
          <button
            className="top-bar-btn danger"
            onClick={handleClearBoard}
            title="Clear all elements from this board"
          >
            🗑 Clear
          </button>
        </div>
        <div className="top-bar-divider" />
        <div className={`connection-status ${connected ? "online" : "offline"}`}>
          <span className="status-dot" />
          {connected ? "Live" : "Offline"}
        </div>
      </motion.div>

      {/* Canvas */}
      {activeBoardId && (
        <DrawingBoard
          elements={elements}
          activeTool={activeTool}
          activeColor={activeColor}
          activeFontWeight={activeFontWeight}
          onDrawElement={handleDrawElement}
          onDeleteElement={handleDeleteElement}
          onCursorMove={handleCursorMove}
          onPushUndo={pushUndo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onlineUsers={onlineUsers}
          reactions={reactions}
          laserPointers={laserPointers}
          onLaserMove={handleLaserMove}
          currentUserId={currentUserId}
          currentUsername={currentUsername}
        />
      )}

      {/* Toolbar */}
      <Toolbar
        activeTool={activeTool}
        activeColor={activeColor}
        activeFontWeight={activeFontWeight}
        onToolChange={setActiveTool}
        onColorChange={setActiveColor}
        onFontWeightChange={setActiveFontWeight}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onReaction={handleSendReaction}
        undoAvailable={undoCount > 0}
        redoAvailable={redoCount > 0}
      />

      {/* Sidebar */}
      <Sidebar
        boards={boards}
        activeBoardId={activeBoardId}
        onlineUsers={onlineUsers}
        chatMessages={chatMessages}
        currentUserId={currentUserId}
        unreadCount={unreadChatCount}
        onJoinBoard={handleJoinBoard}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        onSendChat={handleSendChat}
        onChatOpen={handleChatOpen}
      />

      {/* Toasts */}
      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {/* Welcome Toast */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            className="welcome-toast"
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.4 }}
          >
            <button
              className="welcome-toast-close"
              onClick={() => setShowWelcome(false)}
              aria-label="Dismiss welcome"
            >
              ×
            </button>
            <h4>👋 Welcome, {currentUsername || "Explorer"}!</h4>
            <div>
              Try the new <strong>Sticky Notes</strong> (<kbd>N</kbd>), <strong>Laser Pointer</strong> (<kbd>X</kbd>),
              and <strong>Reactions</strong> 🎉 in the bottom-right.
              Use <kbd>⌘Z</kbd> / <kbd>⌘⇧Z</kbd> to undo/redo, <kbd>V</kbd> to select & drag.
              Scroll to zoom, Shift-drag to pan.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
