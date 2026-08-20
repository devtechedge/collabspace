import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DrawingBoard from "./components/DrawingBoard";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import Toasts, { ToastItem } from "./components/Toasts";
import ThemeToggle from "./components/ThemeToggle";
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
import { isSupabaseConfigured } from "./lib/supabase";
import { loadIdentity } from "./lib/identity";
import { joinBoard, BoardSession } from "./lib/realtime";
import {
  listBoards,
  createBoard,
  deleteBoard,
} from "./lib/boardSync";
import {
  upsertElement,
  deleteElement,
  clearBoardElements,
} from "./lib/canvasSync";
import { sendMessage } from "./lib/chatSync";

// Default spawn position for emoji reactions (canvas-space, near centre).
const CANVAS_CENTER_FALLBACK = { x: 400, y: 300 };

function App() {
  // ─── Identity ────────────────────────────────────────────────────
  const identity = useRef(loadIdentity()).current;
  const [currentUserId] = useState(identity.userId);
  const [currentUsername] = useState(identity.username);
  const [currentColor] = useState(identity.color);

  // ─── Board State ─────────────────────────────────────────────────
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeBoardName, setActiveBoardName] = useState("CollabSpace");

  // ─── Canvas State ────────────────────────────────────────────────
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("PENCIL");
  const [activeColor, setActiveColor] = useState("#ffffff");
  const [activeFontWeight, setActiveFontWeight] = useState("normal");

  // ─── Presence State (includes each peer's current cursor pos) ────
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
    const id = crypto.randomUUID();
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

  // ─── Undo/Redo ───────────────────────────────────────────────────
  const undoStackRef = useRef<HistoryAction[]>([]);
  const redoStackRef = useRef<HistoryAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const refreshCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  // ─── Realtime session ────────────────────────────────────────────
  const sessionRef = useRef<BoardSession | null>(null);

  // ─── Fetch boards on mount ───────────────────────────────────────
  const fetchBoards = useCallback(async () => {
    try {
      const data = await listBoards();
      setBoards(data);
    } catch (err) {
      console.error("Failed to fetch boards:", err);
      pushToast("Failed to load boards", "danger");
    }
  }, [pushToast]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    pushToast(`Connected as ${currentUsername}`, "success");
    fetchBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-select first board ─────────────────────────────────────
  useEffect(() => {
    if (boards.length > 0 && !activeBoardId) {
      handleJoinBoard(boards[0].id, boards[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, activeBoardId]);

  // ─── Join / leave a board ────────────────────────────────────────
  const handleJoinBoard = useCallback(
    async (boardId: string, boardName?: string) => {
      if (boardId === activeBoardId) return;

      // Leave previous session first.
      const prev = sessionRef.current;
      if (prev) {
        prev.leave();
        sessionRef.current = null;
      }

      setActiveBoardId(boardId);
      setActiveBoardName(boardName || "Untitled Board");
      setUnreadChatCount(0);
      setElements([]);
      setChatMessages([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      refreshCounts();

      try {
        const session = await joinBoard(boardId, {
          userId: identity.userId,
          username: identity.username,
          color: identity.color,
        }, {
          onElementUpsert: (el) => {
            setElements((prevEls) => {
              const idx = prevEls.findIndex((e) => e.id === el.id);
              if (idx >= 0) {
                const next = [...prevEls];
                next[idx] = el;
                return next;
              }
              return [...prevEls, el];
            });
          },
          onElementDelete: (id) => {
            setElements((prevEls) => prevEls.filter((e) => e.id !== id));
          },
          onChatMessage: (msg) => {
            setChatMessages((prev) => [...prev, msg]);
            if (!chatTabOpenRef.current && msg.userId !== currentUserId) {
              setUnreadChatCount((c) => c + 1);
            }
          },
          onReaction: (r) => {
            setReactions((prev) => [...prev, r]);
            setTimeout(() => {
              setReactions((prev) => prev.filter((x) => x.id !== r.id));
            }, 3000);
          },
          onLaser: (p) => {
            setLaserPointers((prev) => {
              const filtered = prev.filter((q) => q.userId !== p.userId);
              if (p.active) return [...filtered, p];
              return filtered;
            });
            setTimeout(() => {
              setLaserPointers((prev) => prev.filter((q) => q.userId !== p.userId));
            }, 1500);
          },
          // Cursor position is read from onlineUsers (presence state).
          onPresenceChange: (users) => {
            setOnlineUsers(users);
          },
        });

        // Seed local state from initial fetch.
        setElements(session.initialElements);
        setChatMessages(session.initialMessages);

        sessionRef.current = session;
      } catch (err) {
        console.error("Failed to join board:", err);
        pushToast("Failed to join board", "danger");
      }
    },
    [activeBoardId, identity, pushToast, refreshCounts, currentUserId]
  );

  // ─── Board CRUD ──────────────────────────────────────────────────
  const handleCreateBoard = useCallback(async () => {
    try {
      const newBoard = await createBoard(`Board ${boards.length + 1}`);
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
        await deleteBoard(boardId);
        if (boardId === activeBoardId) {
          sessionRef.current?.leave();
          sessionRef.current = null;
          setActiveBoardId(null);
          setActiveBoardName("CollabSpace");
          setElements([]);
        }
        await fetchBoards();
        pushToast("Board deleted", "success");
      } catch (err) {
        console.error("Failed to delete board:", err);
        pushToast("Failed to delete board", "danger");
      }
    },
    [activeBoardId, fetchBoards, pushToast]
  );

  // ─── Canvas event handlers (called by DrawingBoard) ──────────────
  const handleDrawElement = useCallback(
    async (element: CanvasElement) => {
      if (!activeBoardId) return;
      try {
        await upsertElement(activeBoardId, element);
      } catch (err) {
        console.error("Failed to save element:", err);
      }
    },
    [activeBoardId]
  );

  const handleDeleteElement = useCallback(async (elementId: string) => {
    try {
      await deleteElement(elementId);
    } catch (err) {
      console.error("Failed to delete element:", err);
    }
  }, []);

  const handleClearBoard = useCallback(async () => {
    if (!activeBoardId) return;
    try {
      await clearBoardElements(activeBoardId);
      setElements([]);
      undoStackRef.current = [];
      redoStackRef.current = [];
      refreshCounts();
      pushToast("Board cleared", "success");
    } catch (err) {
      console.error("Failed to clear board:", err);
      pushToast("Failed to clear board", "danger");
    }
  }, [activeBoardId, pushToast, refreshCounts]);

  const handleElementRevert = useCallback(
    async (element: CanvasElement) => {
      if (!activeBoardId) return;
      try {
        if (element._deleted) {
          await deleteElement(element.id);
        } else {
          await upsertElement(activeBoardId, element);
        }
      } catch (err) {
        console.error("Failed to revert element:", err);
      }
    },
    [activeBoardId]
  );

  // ─── Cursor move (presence update, ~30fps throttled upstream) ────
  const handleCursorMove = useCallback((position: { x: number; y: number }) => {
    sessionRef.current?.updateOwnCursor(position);
  }, []);

  // ─── Laser pointer (broadcast only, ephemeral) ───────────────────
  const handleLaserMove = useCallback(
    (position: { x: number; y: number } | null) => {
      if (!position) return;
      sessionRef.current?.sendLaser({ ...position, active: true });
      // Auto-deactivate after 800ms of no movement (matches original).
      if (laserEmitTimeoutRef.current) {
        clearTimeout(laserEmitTimeoutRef.current);
      }
      laserEmitTimeoutRef.current = window.setTimeout(() => {
        sessionRef.current?.sendLaser({ x: 0, y: 0, active: false });
      }, 800);
    },
    []
  );

  // ─── Reaction (broadcast only, ephemeral, randomised spawn pos) ──
  const handleSendReaction = useCallback((emoji: string) => {
    const x = CANVAS_CENTER_FALLBACK.x + Math.random() * 200 - 100;
    const y = CANVAS_CENTER_FALLBACK.y + Math.random() * 100 - 50;
    sessionRef.current?.sendReaction({ emoji, x, y });
  }, []);

  // ─── Chat send ───────────────────────────────────────────────────
  const handleSendChat = useCallback(
    async (text: string) => {
      if (!activeBoardId) return;
      try {
        await sendMessage(activeBoardId, identity, text);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [activeBoardId, identity]
  );

  // ─── Undo/Redo wiring ────────────────────────────────────────────
  const handlePushUndo = useCallback((action: HistoryAction) => {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
    refreshCounts();
  }, [refreshCounts]);

  const handleUndo = useCallback(() => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    redoStackRef.current.push(action);
    refreshCounts();
    if (action.type === "DELETE") {
      handleElementRevert({ ...action.element, _deleted: false });
    } else if (action.type === "ADD") {
      handleDeleteElement(action.element.id);
    } else if (action.type === "MODIFY" && action.previousState) {
      handleElementRevert({ ...action.previousState, _deleted: false });
    }
  }, [handleDeleteElement, handleElementRevert, refreshCounts]);

  const handleRedo = useCallback(() => {
    const action = redoStackRef.current.pop();
    if (!action) return;
    undoStackRef.current.push(action);
    refreshCounts();
    if (action.type === "ADD" || action.type === "MODIFY") {
      handleElementRevert({ ...action.element, _deleted: false });
    } else if (action.type === "DELETE") {
      handleDeleteElement(action.element.id);
    }
  }, [handleDeleteElement, handleElementRevert, refreshCounts]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); return; }
      }

      const keyMap: Record<string, Tool> = {
        v: "SELECT", p: "PENCIL", l: "LINE", r: "RECTANGLE",
        c: "CIRCLE", t: "TEXT", e: "ERASER", n: "STICKY", x: "LASER",
      };
      const tool = keyMap[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ─── Cleanup on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      sessionRef.current?.leave();
      sessionRef.current = null;
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div
        className="app-container"
        data-testid="supabase-unconfigured"
        style={{ padding: 40, fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}
      >
        <h1 data-testid="site-title">⚠️ Supabase not configured</h1>
        <p>
          Copy <code>client/.env.example</code> to <code>client/.env</code> and fill in
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your
          Supabase project.
        </p>
        <p>See <code>README.md</code> for full setup steps.</p>
      </div>
    );
  }

  return (
    <div className="app-container" data-testid="app-shell">
      <DrawingBoard
        elements={elements}
        activeTool={activeTool}
        activeColor={activeColor}
        activeFontWeight={activeFontWeight}
        onDrawElement={handleDrawElement}
        onDeleteElement={handleDeleteElement}
        onCursorMove={handleCursorMove}
        onPushUndo={handlePushUndo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onlineUsers={onlineUsers}
        reactions={reactions}
        laserPointers={laserPointers}
        onLaserMove={handleLaserMove}
        currentUserId={currentUserId}
        currentUsername={currentUsername}
      />
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
        onClearBoard={handleClearBoard}
        onChatOpen={() => {
          chatTabOpenRef.current = true;
          setUnreadChatCount(0);
        }}
        onChatClose={() => {
          chatTabOpenRef.current = false;
        }}
        activeBoardName={activeBoardName}
        currentUsername={currentUsername}
        connected={isSupabaseConfigured}
        themeToggle={<ThemeToggle />}
      />
      <Toasts toasts={toasts} onDismiss={dismissToast} />

      <AnimatePresence>
        {showWelcome && (
          <motion.div
            className="welcome-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
            aria-live="polite"
            onClick={() => setShowWelcome(false)}
          >
            <h4>👋 Welcome, {currentUsername}!</h4>
            <div>
              Try the new <strong>Sticky Notes</strong> (<kbd>N</kbd>), <strong>Laser Pointer</strong> (<kbd>X</kbd>),
              and <strong>Reactions</strong> 🎉 in the bottom-right.
              Use <kbd>⌘Z</kbd> / <kbd>⌘⇧Z</kbd> to undo/redo, <kbd>V</kbd> to select &amp; drag.
              Scroll to zoom, Shift-drag to pan.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
