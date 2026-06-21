// ─── Core Geometry ────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

// ─── Element Type Enums ───────────────────────────────────────────

export type ElementType =
  | "PENCIL"
  | "LINE"
  | "RECTANGLE"
  | "CIRCLE"
  | "TEXT"
  | "ERASER"
  | "STICKY";

export type Tool =
  | "SELECT"
  | "PENCIL"
  | "LINE"
  | "RECTANGLE"
  | "CIRCLE"
  | "TEXT"
  | "ERASER"
  | "STICKY"
  | "LASER";

// ─── Canvas Element Models ────────────────────────────────────────

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontWeight: string;
  textContent: string;
  points: Point[];
  createdAt?: string;
  _deleted?: boolean; // Used for undo/redo revert signalling
}

export interface PencilElement extends BaseElement {
  type: "PENCIL";
  points: Point[];
}

export interface EraserElement extends BaseElement {
  type: "ERASER";
  points: Point[];
}

export interface LineElement extends BaseElement {
  type: "LINE";
}

export interface ShapeElement extends BaseElement {
  type: "RECTANGLE" | "CIRCLE";
}

export interface TextElement extends BaseElement {
  type: "TEXT";
  textContent: string;
  fontWeight: string;
}

export interface StickyElement extends BaseElement {
  type: "STICKY";
  textContent: string;
  // color holds the sticky background; fontWeight toggles bold body text
}

export type CanvasElement =
  | PencilElement
  | EraserElement
  | LineElement
  | ShapeElement
  | TextElement
  | StickyElement;

// ─── User Presence ────────────────────────────────────────────────

export interface UserPresence {
  userId: string;
  username: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

// ─── Chat ─────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  boardId: string;
  userId: string;
  username: string;
  userColor: string;
  text: string;
  createdAt: string;
}

// ─── Reactions (ephemeral, not persisted) ─────────────────────────

export interface Reaction {
  id: string;
  userId: string;
  username: string;
  userColor: string;
  emoji: string;
  x: number; // canvas-space position
  y: number;
  createdAt: number; // epoch ms
}

// ─── Laser Pointer (ephemeral, not persisted) ─────────────────────

export interface LaserPointer {
  userId: string;
  username: string;
  color: string;
  x: number; // canvas-space
  y: number;
  active: boolean;
}

// ─── Socket Events ────────────────────────────────────────────────

export interface ServerToClientEvents {
  "canvas-history": (elements: CanvasElement[]) => void;
  "element-update": (element: CanvasElement) => void;
  "element-delete": (elementId: string) => void;
  "cursor-update": (
    data: {
      userId: string;
      username: string;
      color: string;
      cursor: { x: number; y: number };
    }
  ) => void;
  "presence-update": (users: UserPresence[]) => void;
  "canvas-cleared": () => void;
  "chat-history": (messages: ChatMessage[]) => void;
  "chat-message": (message: ChatMessage) => void;
  "reaction-burst": (reaction: Reaction) => void;
  "laser-pointer": (data: LaserPointer) => void;
}

export interface ClientToServerEvents {
  "join-room": (boardId: string) => void;
  "draw-element": (element: CanvasElement) => void;
  "delete-element": (elementId: string) => void;
  "cursor-move": (position: { x: number; y: number }) => void;
  "clear-board": () => void;
  "element-revert": (element: CanvasElement) => void;
  "send-chat": (text: string) => void;
  "send-reaction": (reaction: {
    emoji: string;
    x: number;
    y: number;
  }) => void;
  "laser-pointer": (data: { x: number; y: number; active: boolean }) => void;
}

// ─── Board Model ──────────────────────────────────────────────────

export interface Board {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count?: { elements: number };
}

// ─── Undo/Redo Action Types ───────────────────────────────────────

export type ActionType = "ADD" | "MODIFY" | "DELETE";

export interface HistoryAction {
  type: ActionType;
  element: CanvasElement;
  previousState?: CanvasElement; // For MODIFY actions, store the previous state
}
