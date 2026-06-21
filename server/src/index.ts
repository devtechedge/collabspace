import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
  },
});

// ─── REST API Routes ────────────────────────────────────────────────

// List all boards
app.get("/api/boards", async (_req, res) => {
  try {
    const boards = await prisma.board.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { elements: true } } },
    });
    res.json(boards);
  } catch (error) {
    console.error("Failed to fetch boards:", error);
    res.status(500).json({ error: "Failed to fetch boards" });
  }
});

// Create a new board
app.post("/api/boards", async (req, res) => {
  try {
    const { name } = req.body;
    const board = await prisma.board.create({
      data: { name: name || "Untitled Board", id: uuidv4() },
    });
    res.json(board);
  } catch (error) {
    console.error("Failed to create board:", error);
    res.status(500).json({ error: "Failed to create board" });
  }
});

// Get a single board with its elements
app.get("/api/boards/:boardId", async (req, res) => {
  try {
    const board = await prisma.board.findUnique({
      where: { id: req.params.boardId },
      include: { elements: { orderBy: { createdAt: "asc" } } },
    });
    if (!board) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    res.json(board);
  } catch (error) {
    console.error("Failed to fetch board:", error);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

// Delete a board
app.delete("/api/boards/:boardId", async (req, res) => {
  try {
    await prisma.board.delete({ where: { id: req.params.boardId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete board:", error);
    res.status(500).json({ error: "Failed to delete board" });
  }
});

// Rename a board
app.patch("/api/boards/:boardId", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const updated = await prisma.board.update({
      where: { id: req.params.boardId },
      data: { name: name.trim() },
    });
    res.json(updated);
  } catch (error) {
    console.error("Failed to rename board:", error);
    res.status(500).json({ error: "Failed to rename board" });
  }
});

// Get recent chat messages for a board (last 200)
app.get("/api/boards/:boardId/messages", async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { boardId: req.params.boardId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    res.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ─── Connected User Tracking ────────────────────────────────────────

interface RoomPresence {
  [socketId: string]: {
    userId: string;
    username: string;
    cursor: { x: number; y: number } | null;
    color: string;
  };
}

const roomPresence: Map<string, RoomPresence> = new Map();

const USER_COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#fb923c", "#a855f7",
];

function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

// Generate friendly random usernames
const ADJECTIVES = ["Swift", "Cosmic", "Quiet", "Bold", "Crimson", "Azure", "Lunar", "Solar", "Hidden", "Vivid"];
const NOUNS = ["Falcon", "Comet", "River", "Spark", "Pine", "Otter", "Cipher", "Echo", "Atlas", "Nova"];

function makeUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

// ─── Helper: serialize Prisma element to client shape ──────────────

function serializeElement(el: any) {
  return {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    points: typeof el.points === "string" ? JSON.parse(el.points) : el.points,
    color: el.color,
    fontWeight: el.fontWeight,
    textContent: el.textContent,
    createdAt: el.createdAt?.toISOString?.() ?? el.createdAt,
  };
}

// ─── Socket.io State Engine ─────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  const userId = uuidv4();
  const username = makeUsername();
  const userColor = getRandomColor();
  let currentRoom: string | null = null;

  console.log(`[Connect] ${username} (${socket.id})`);

  // Send the client its identity so it can render its own avatar
  socket.emit("identity", { userId, username, color: userColor });

  // ── Join Room ───────────────────────────────────────────────────
  socket.on("join-room", async (boardId: string) => {
    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      if (roomPresence.has(currentRoom)) {
        delete roomPresence.get(currentRoom)![socket.id];
        io.to(currentRoom).emit(
          "presence-update",
          Object.values(roomPresence.get(currentRoom) || {})
        );
      }
    }

    currentRoom = boardId;
    socket.join(boardId);

    // Register presence
    if (!roomPresence.has(boardId)) {
      roomPresence.set(boardId, {});
    }
    roomPresence.get(boardId)![socket.id] = {
      userId,
      username,
      cursor: null,
      color: userColor,
    };

    // Fetch canvas history from database and emit to joining client
    try {
      const elements = await prisma.element.findMany({
        where: { boardId },
        orderBy: { createdAt: "asc" },
      });

      const parsedElements = elements.map(serializeElement);
      socket.emit("canvas-history", parsedElements);
    } catch (error) {
      console.error("Failed to fetch canvas history:", error);
      socket.emit("canvas-history", []);
    }

    // Fetch and emit chat history
    try {
      const messages = await prisma.message.findMany({
        where: { boardId },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      socket.emit(
        "chat-history",
        messages.map((m: { id: string; boardId: string; userId: string; username: string; userColor: string; text: string; createdAt: Date }) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))
      );
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
      socket.emit("chat-history", []);
    }

    // Broadcast updated presence to room
    io.to(boardId).emit(
      "presence-update",
      Object.values(roomPresence.get(boardId) || {})
    );

    console.log(`[Join] ${username} joined board ${boardId}`);
  });

  // ── Draw Element ────────────────────────────────────────────────
  socket.on("draw-element", async (element: any) => {
    if (!currentRoom) return;

    try {
      const pointsJson = JSON.stringify(element.points || []);

      const upsertData = {
        boardId: currentRoom,
        type: element.type,
        x: element.x ?? 0,
        y: element.y ?? 0,
        width: element.width ?? 0,
        height: element.height ?? 0,
        points: pointsJson,
        color: element.color ?? "#ffffff",
        fontWeight: element.fontWeight ?? "normal",
        textContent: element.textContent ?? "",
      };

      // Optimistically upsert — create if new, update if existing
      await prisma.element.upsert({
        where: { id: element.id },
        update: upsertData,
        create: { id: element.id, ...upsertData },
      });

      // Broadcast to all other clients in the room
      socket.to(currentRoom).emit("element-update", {
        ...element,
        points: element.points,
      });
    } catch (error) {
      console.error("Failed to persist element:", error);
    }
  });

  // ── Delete Element ──────────────────────────────────────────────
  socket.on("delete-element", async (elementId: string) => {
    if (!currentRoom) return;

    try {
      await prisma.element.delete({ where: { id: elementId } });
      socket.to(currentRoom).emit("element-delete", elementId);
    } catch (error) {
      console.error("Failed to delete element:", error);
    }
  });

  // ── Cursor Move (throttled by client at ~30fps) ─────────────────
  socket.on("cursor-move", (position: { x: number; y: number }) => {
    if (!currentRoom) return;
    if (roomPresence.has(currentRoom)) {
      const presence = roomPresence.get(currentRoom)!;
      if (presence[socket.id]) {
        presence[socket.id].cursor = position;
        socket.to(currentRoom).emit("cursor-update", {
          userId,
          username,
          color: userColor,
          cursor: position,
        });
      }
    }
  });

  // ── Clear Board ─────────────────────────────────────────────────
  socket.on("clear-board", async () => {
    if (!currentRoom) return;

    try {
      await prisma.element.deleteMany({ where: { boardId: currentRoom } });
      io.to(currentRoom).emit("canvas-cleared");
      console.log(`[Clear] Board ${currentRoom} cleared by ${username}`);
    } catch (error) {
      console.error("Failed to clear board:", error);
    }
  });

  // ── Undo/Redo State Reversion ───────────────────────────────────
  socket.on("element-revert", async (element: any) => {
    if (!currentRoom) return;

    try {
      if (element._deleted) {
        // Element was undone from existence — delete from DB
        await prisma.element.delete({ where: { id: element.id } }).catch(() => {});
        socket.to(currentRoom).emit("element-delete", element.id);
      } else {
        // Element state reverted — upsert the previous state
        const pointsJson = JSON.stringify(element.points || []);
        await prisma.element.upsert({
          where: { id: element.id },
          update: {
            type: element.type,
            x: element.x ?? 0,
            y: element.y ?? 0,
            width: element.width ?? 0,
            height: element.height ?? 0,
            points: pointsJson,
            color: element.color ?? "#ffffff",
            fontWeight: element.fontWeight ?? "normal",
            textContent: element.textContent ?? "",
          },
          create: {
            id: element.id,
            boardId: currentRoom,
            type: element.type,
            x: element.x ?? 0,
            y: element.y ?? 0,
            width: element.width ?? 0,
            height: element.height ?? 0,
            points: pointsJson,
            color: element.color ?? "#ffffff",
            fontWeight: element.fontWeight ?? "normal",
            textContent: element.textContent ?? "",
          },
        });
        socket.to(currentRoom).emit("element-update", {
          ...element,
          points: element.points,
        });
      }
    } catch (error) {
      console.error("Failed to revert element:", error);
    }
  });

  // ── Chat Message ────────────────────────────────────────────────
  socket.on("send-chat", async (text: string) => {
    if (!currentRoom) return;
    const trimmed = (text || "").trim();
    if (!trimmed || trimmed.length > 1000) return;

    try {
      const message = await prisma.message.create({
        data: {
          boardId: currentRoom,
          userId,
          username,
          userColor,
          text: trimmed,
        },
      });

      const payload = {
        ...message,
        createdAt: message.createdAt.toISOString(),
      };

      // Emit to everyone in the room including sender for confirmation
      io.to(currentRoom).emit("chat-message", payload);
    } catch (error) {
      console.error("Failed to persist chat message:", error);
    }
  });

  // ── Reaction Burst (ephemeral, broadcast only) ──────────────────
  socket.on("send-reaction", (reaction: { emoji: string; x: number; y: number }) => {
    if (!currentRoom) return;
    const allowedEmojis = ["🎉", "👍", "❤️", "💡", "🚀", "🔥", "👏", "😮"];
    if (!allowedEmojis.includes(reaction.emoji)) return;

    const payload = {
      id: uuidv4(),
      userId,
      username,
      userColor,
      emoji: reaction.emoji,
      x: reaction.x,
      y: reaction.y,
      createdAt: Date.now(),
    };

    // Broadcast to everyone in the room (including sender for visual confirmation)
    io.to(currentRoom).emit("reaction-burst", payload);
  });

  // ── Laser Pointer (ephemeral, broadcast only) ───────────────────
  socket.on("laser-pointer", (data: { x: number; y: number; active: boolean }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("laser-pointer", {
      userId,
      username,
      color: userColor,
      x: data.x,
      y: data.y,
      active: data.active,
    });
  });

  // ── Disconnect ──────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (currentRoom && roomPresence.has(currentRoom)) {
      delete roomPresence.get(currentRoom)![socket.id];
      const remaining = Object.values(roomPresence.get(currentRoom) || {});
      io.to(currentRoom).emit("presence-update", remaining);

      // Clean up empty room presence entries
      if (remaining.length === 0) {
        roomPresence.delete(currentRoom);
      }
    }
    console.log(`[Disconnect] ${username} (${socket.id})`);
  });
});

// ─── Seed a default board on startup ─────────────────────────────

async function seedDefaultBoard() {
  const existing = await prisma.board.findFirst();
  if (!existing) {
    await prisma.board.create({
      data: { id: uuidv4(), name: "Welcome Board" },
    });
    console.log("[Seed] Created default 'Welcome Board'");
  }
}

// ─── Start Server ────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

async function main() {
  await prisma.$connect();
  console.log("[Prisma] Database connected");
  await seedDefaultBoard();

  httpServer.listen(PORT, () => {
    console.log(`[Server] CollabSpace running on http://localhost:${PORT}`);
    console.log(`[Socket.io] WebSocket engine active`);
  });
}

main()
  .catch((err) => {
    console.error("[Fatal] Startup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    // Keep connection alive; only disconnect on process exit
  });

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
