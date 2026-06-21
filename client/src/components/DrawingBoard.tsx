import { useRef, useEffect, useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { AnimatePresence } from "framer-motion";
import {
  CanvasElement,
  Tool,
  UserPresence,
  Point,
  HistoryAction,
  StickyElement,
  Reaction,
  LaserPointer,
} from "../types";
import StickyNote from "./StickyNote";
import ReactionsLayer from "./ReactionsLayer";
import LaserLayer from "./LaserLayer";
import Minimap from "./Minimap";

interface DrawingBoardProps {
  elements: CanvasElement[];
  activeTool: Tool;
  activeColor: string;
  activeFontWeight: string;
  onDrawElement: (element: CanvasElement) => void;
  onDeleteElement: (elementId: string) => void;
  onCursorMove: (position: { x: number; y: number }) => void;
  onPushUndo: (action: HistoryAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  onlineUsers: UserPresence[];
  reactions: Reaction[];
  laserPointers: LaserPointer[];
  onLaserMove: (position: { x: number; y: number } | null) => void;
  currentUserId: string;
  currentUsername: string;
}

// ─── Coordinate Transform Utilities ──────────────────────────────
// Canvas-space coordinates are independent of zoom and pan:
//   X_canvas = (X_screen - Pan_X) / Zoom
//   Y_canvas = (Y_screen - Pan_Y) / Zoom

function screenToCanvas(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): Point {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

function canvasToScreen(
  canvasX: number,
  canvasY: number,
  panX: number,
  panY: number,
  zoom: number
): Point {
  return {
    x: canvasX * zoom + panX,
    y: canvasY * zoom + panY,
  };
}

// ─── Pencil Smoothing (Chaikin's Algorithm) ──────────────────────

function smoothPoints(points: Point[], iterations: number = 2): Point[] {
  if (points.length < 3) return points;
  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

// ─── Element Hit Testing ─────────────────────────────────────────

function isPointInElement(pt: Point, el: CanvasElement): boolean {
  const margin = 6;
  switch (el.type) {
    case "RECTANGLE":
      return (
        pt.x >= el.x - margin &&
        pt.x <= el.x + el.width + margin &&
        pt.y >= el.y - margin &&
        pt.y <= el.y + el.height + margin
      );
    case "CIRCLE": {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = el.width / 2 + margin;
      const ry = el.height / 2 + margin;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    case "LINE": {
      const dist = distPointToSegment(pt, { x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height });
      return dist <= margin + 3;
    }
    case "TEXT":
      return (
        pt.x >= el.x - margin &&
        pt.x <= el.x + el.width + margin &&
        pt.y >= el.y - margin &&
        pt.y <= el.y + el.height + margin
      );
    case "STICKY":
      // Sticky notes have fixed canvas size 180x140 (approx)
      return (
        pt.x >= el.x - margin &&
        pt.x <= el.x + 180 + margin &&
        pt.y >= el.y - margin &&
        pt.y <= el.y + 140 + margin
      );
    case "PENCIL":
    case "ERASER": {
      if (!el.points || el.points.length === 0) return false;
      for (const p of el.points) {
        const d = Math.sqrt((pt.x - p.x) ** 2 + (pt.y - p.y) ** 2);
        if (d <= margin + 4) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

// Default sticky color cycle
const STICKY_PALETTE = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#fed7aa", "#ddd6fe"];

// ─── Component ───────────────────────────────────────────────────

function DrawingBoard({
  elements,
  activeTool,
  activeColor,
  activeFontWeight,
  onDrawElement,
  onDeleteElement,
  onCursorMove,
  onPushUndo,
  onUndo,
  onRedo,
  onlineUsers,
  reactions,
  laserPointers,
  onLaserMove,
  currentUserId,
  currentUsername,
}: DrawingBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Viewport Transform State ────────────────────────────────────
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  // Force re-render of overlays when viewport changes
  const [, setViewportTick] = useState(0);
  const bumpViewport = useCallback(() => setViewportTick((t) => t + 1), []);
  const [zoomDisplay, setZoomDisplay] = useState(100);

  // ─── Drawing State ───────────────────────────────────────────────
  const isDrawingRef = useRef(false);
  const currentElementRef = useRef<CanvasElement | null>(null);
  const pencilPointsRef = useRef<Point[]>([]);

  // ─── Panning State ───────────────────────────────────────────────
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panStartMouseRef = useRef({ x: 0, y: 0 });

  // ─── Selection State ─────────────────────────────────────────────
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragElementStartRef = useRef({ x: 0, y: 0 });

  // ─── Text Input State ────────────────────────────────────────────
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // ─── Cursor Throttle (~30fps) ────────────────────────────────────
  const lastCursorEmitRef = useRef(0);

  // ─── Remote Cursors ──────────────────────────────────────────────
  const [remoteCursors, setRemoteCursors] = useState<
    Map<string, { username: string; color: string; x: number; y: number }>
  >(new Map());

  // ─── Container size (for minimap viewport indicator) ────────────
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ─── Canvas Resize ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      setContainerSize({ width: w, height: h });
      render();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // ─── Render Loop ─────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const pan = panRef.current;
    const zoom = zoomRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply viewport transform
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw all elements (skip STICKY — those render as HTML overlays)
    for (const element of elements) {
      if (element.type === "STICKY") continue;
      drawElement(ctx, element);
    }

    // Draw the element currently being drawn (if any)
    if (currentElementRef.current && currentElementRef.current.type !== "STICKY") {
      drawElement(ctx, currentElementRef.current);
    }

    // Draw selection highlight (skip for STICKY — has its own outline)
    if (selectedElementId) {
      const selected = elements.find((e) => e.id === selectedElementId);
      if (selected && selected.type !== "STICKY") {
        drawSelectionBox(ctx, selected);
      }
    }

    ctx.restore();
  }, [elements, selectedElementId]);

  // Re-render whenever elements or selection changes
  useEffect(() => {
    render();
  }, [render]);

  // ─── Draw Individual Element ─────────────────────────────────────
  function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (el.type) {
      case "PENCIL": {
        if (!el.points || el.points.length < 2) {
          ctx.restore();
          return;
        }
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
        break;
      }
      case "ERASER": {
        if (!el.points || el.points.length < 2) {
          ctx.restore();
          return;
        }
        ctx.strokeStyle = "#0b0f17";
        ctx.lineWidth = 20;
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        break;
      }
      case "LINE": {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.stroke();
        break;
      }
      case "RECTANGLE": {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        break;
      }
      case "CIRCLE": {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const rx = Math.abs(el.width) / 2;
        const ry = Math.abs(el.height) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "TEXT": {
        ctx.fillStyle = el.color;
        ctx.font = `${el.fontWeight === "bold" ? "bold " : ""}16px Inter, sans-serif`;
        ctx.textBaseline = "top";

        const lines = (el.textContent || "").split("\n");
        let yPos = el.y;
        for (const line of lines) {
          ctx.fillText(line, el.x, yPos);
          yPos += 20;
        }

        // Auto-calculate text bounding box
        const maxWidth = Math.max(
          ...lines.map((l) => ctx.measureText(l).width),
          10
        );
        el.width = maxWidth;
        el.height = lines.length * 20;
        break;
      }
      // STICKY handled as HTML overlay — not drawn on canvas
      case "STICKY":
        break;
    }

    ctx.restore();
  }

  // ─── Draw Selection Box ──────────────────────────────────────────
  function drawSelectionBox(ctx: CanvasRenderingContext2D, el: CanvasElement) {
    ctx.save();
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1.5 / zoomRef.current;
    ctx.setLineDash([6 / zoomRef.current, 4 / zoomRef.current]);

    let bx = el.x;
    let by = el.y;
    let bw = el.width;
    let bh = el.height;

    if (el.type === "PENCIL" || el.type === "ERASER") {
      if (el.points && el.points.length > 0) {
        const xs = el.points.map((p) => p.x);
        const ys = el.points.map((p) => p.y);
        bx = Math.min(...xs) - 4;
        by = Math.min(...ys) - 4;
        bw = Math.max(...xs) - bx + 8;
        bh = Math.max(...ys) - by + 8;
      }
    }

    ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ─── Mouse Event Handlers ────────────────────────────────────────

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToCanvas(
        e.clientX - rect.left,
        e.clientY - rect.top,
        panRef.current.x,
        panRef.current.y,
        zoomRef.current
      );
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click or Shift+Left = Pan
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanningRef.current = true;
        panStartMouseRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { ...panRef.current };
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      const pt = getCanvasPoint(e);

      // ── LASER Tool: activate laser (no element created) ──────
      if (activeTool === "LASER") {
        onLaserMove(pt);
        return;
      }

      // ── STICKY Tool: create a sticky note at click point ─────
      if (activeTool === "STICKY") {
        const colorIdx = Math.floor(Math.random() * STICKY_PALETTE.length);
        const newSticky: StickyElement = {
          id: uuidv4(),
          type: "STICKY",
          x: pt.x,
          y: pt.y,
          width: 180,
          height: 140,
          color: STICKY_PALETTE[colorIdx],
          fontWeight: "normal",
          textContent: "",
          points: [],
        };
        onPushUndo({ type: "ADD", element: newSticky });
        onDrawElement(newSticky);
        setSelectedElementId(newSticky.id);
        bumpViewport();
        return;
      }

      // ── SELECT Tool ────────────────────────────────────────────
      if (activeTool === "SELECT") {
        // Find topmost element under cursor (iterate reverse for z-order)
        let found: CanvasElement | null = null;
        for (let i = elements.length - 1; i >= 0; i--) {
          if (isPointInElement(pt, elements[i])) {
            found = elements[i];
            break;
          }
        }

        if (found) {
          setSelectedElementId(found.id);
          // Only initiate canvas-level drag for non-sticky elements
          // (stickies handle their own drag via StickyNote component)
          if (found.type !== "STICKY") {
            isDraggingRef.current = true;
            dragStartRef.current = pt;
            dragElementStartRef.current = { x: found.x, y: found.y };
          }
        } else {
          setSelectedElementId(null);
        }
        return;
      }

      // ── ERASER Tool ───────────────────────────────────────────
      if (activeTool === "ERASER") {
        isDrawingRef.current = true;
        const newElement: CanvasElement = {
          id: uuidv4(),
          type: "ERASER",
          x: pt.x,
          y: pt.y,
          width: 0,
          height: 0,
          points: [pt],
          color: "#0b0f17",
          fontWeight: "normal",
          textContent: "",
        };
        currentElementRef.current = newElement;
        pencilPointsRef.current = [pt];
        onPushUndo({ type: "ADD", element: newElement });
        render();
        return;
      }

      // ── TEXT Tool ─────────────────────────────────────────────
      if (activeTool === "TEXT") {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTextInput({
          visible: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          canvasX: pt.x,
          canvasY: pt.y,
        });
        return;
      }

      // ── Drawing Tools (Pencil, Line, Rectangle, Circle) ──────
      isDrawingRef.current = true;

      const newElement: CanvasElement = {
        id: uuidv4(),
        type: activeTool as CanvasElement["type"],
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        points: activeTool === "PENCIL" ? [pt] : [],
        color: activeColor,
        fontWeight: activeFontWeight,
        textContent: "",
      };

      currentElementRef.current = newElement;
      pencilPointsRef.current = [pt];
      onPushUndo({ type: "ADD", element: newElement });
      render();
    },
    [activeTool, activeColor, activeFontWeight, elements, getCanvasPoint, onPushUndo, render, onDrawElement, onLaserMove, bumpViewport]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const now = performance.now();

      // ── Panning ────────────────────────────────────────────────
      if (isPanningRef.current) {
        const dx = e.clientX - panStartMouseRef.current.x;
        const dy = e.clientY - panStartMouseRef.current.y;
        panRef.current = {
          x: panStartRef.current.x + dx,
          y: panStartRef.current.y + dy,
        };
        bumpViewport();
        render();
        return;
      }

      const pt = getCanvasPoint(e);

      // ── Throttled cursor broadcast (~30fps) ────────────────────
      if (now - lastCursorEmitRef.current > 33) {
        lastCursorEmitRef.current = now;
        onCursorMove({ x: pt.x, y: pt.y });

        // LASER tool broadcasts on every move (while active)
        if (activeTool === "LASER") {
          onLaserMove(pt);
        }
      }

      // ── Dragging selected element ──────────────────────────────
      if (isDraggingRef.current && selectedElementId) {
        const dx = pt.x - dragStartRef.current.x;
        const dy = pt.y - dragStartRef.current.y;
        const el = elements.find((e) => e.id === selectedElementId);
        if (el) {
          const updated: CanvasElement = {
            ...el,
            x: dragElementStartRef.current.x + dx,
            y: dragElementStartRef.current.y + dy,
            points:
              el.type === "PENCIL" || el.type === "ERASER"
                ? el.points.map((p) => ({
                    x: p.x + dx - (el.x - dragElementStartRef.current.x),
                    y: p.y + dy - (el.y - dragElementStartRef.current.y),
                  }))
                : el.points,
          };
          onDrawElement(updated);
        }
        return;
      }

      // ── Drawing ────────────────────────────────────────────────
      if (!isDrawingRef.current || !currentElementRef.current) return;

      const el = currentElementRef.current;

      if (el.type === "PENCIL" || el.type === "ERASER") {
        pencilPointsRef.current.push(pt);
        const smoothed = smoothPoints(pencilPointsRef.current, 1);
        currentElementRef.current = {
          ...el,
          points: smoothed,
          x: Math.min(...smoothed.map((p) => p.x)),
          y: Math.min(...smoothed.map((p) => p.y)),
        };
      } else if (el.type === "LINE") {
        currentElementRef.current = {
          ...el,
          width: pt.x - el.x,
          height: pt.y - el.y,
        };
      } else if (el.type === "RECTANGLE") {
        currentElementRef.current = {
          ...el,
          width: pt.x - el.x,
          height: pt.y - el.y,
        };
      } else if (el.type === "CIRCLE") {
        currentElementRef.current = {
          ...el,
          width: pt.x - el.x,
          height: pt.y - el.y,
        };
      }

      render();
    },
    [elements, getCanvasPoint, onCursorMove, onDrawElement, render, selectedElementId, activeTool, onLaserMove, bumpViewport]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // ── End Panning ────────────────────────────────────────────
      if (isPanningRef.current) {
        isPanningRef.current = false;
        bumpViewport();
        return;
      }

      // ── LASER deactivate on mouse up ──────────────────────────
      if (activeTool === "LASER") {
        onLaserMove(null);
        return;
      }

      // ── End Dragging ───────────────────────────────────────────
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        // Push modify action for undo
        const el = elements.find((e) => e.id === selectedElementId);
        if (el) {
          onPushUndo({
            type: "MODIFY",
            element: el,
            previousState: {
              ...el,
              x: dragElementStartRef.current.x,
              y: dragElementStartRef.current.y,
            },
          });
        }
        return;
      }

      // ── End Drawing ────────────────────────────────────────────
      if (isDrawingRef.current && currentElementRef.current) {
        onDrawElement(currentElementRef.current);
        currentElementRef.current = null;
        isDrawingRef.current = false;
        pencilPointsRef.current = [];
        render();
      }
    },
    [elements, onDrawElement, onPushUndo, render, selectedElementId, activeTool, onLaserMove, bumpViewport]
  );

  // ── Deactivate laser when mouse leaves canvas ────────────────────
  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === "LASER") {
        onLaserMove(null);
      }
      // Trigger mouseUp for normal cleanup
      handleMouseUp(e);
    },
    [activeTool, onLaserMove, handleMouseUp]
  );

  // ─── Wheel Zoom ──────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.1, Math.min(5, zoomRef.current * zoomFactor));

      // Zoom toward cursor position
      panRef.current = {
        x: mouseX - (mouseX - panRef.current.x) * (newZoom / zoomRef.current),
        y: mouseY - (mouseY - panRef.current.y) * (newZoom / zoomRef.current),
      };
      zoomRef.current = newZoom;

      setZoomDisplay(Math.round(newZoom * 100));
      bumpViewport();
      render();
    },
    [render, bumpViewport]
  );

  // ─── Text Input Commit ───────────────────────────────────────────
  const handleTextCommit = useCallback(
    (text: string) => {
      if (!textInput || !text.trim()) {
        setTextInput(null);
        return;
      }

      const newElement: CanvasElement = {
        id: uuidv4(),
        type: "TEXT",
        x: textInput.canvasX,
        y: textInput.canvasY,
        width: 0, // Auto-calculated during draw
        height: 0,
        points: [],
        color: activeColor,
        fontWeight: activeFontWeight,
        textContent: text,
      };

      onPushUndo({ type: "ADD", element: newElement });
      onDrawElement(newElement);
      setTextInput(null);
    },
    [textInput, activeColor, activeFontWeight, onPushUndo, onDrawElement]
  );

  // ─── Keyboard Delete ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedElementId) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        const el = elements.find((e) => e.id === selectedElementId);
        if (el) {
          onPushUndo({ type: "DELETE", element: el });
          onDeleteElement(selectedElementId);
          setSelectedElementId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElementId, elements, onPushUndo, onDeleteElement]);

  // ─── Update Remote Cursors from Presence ──────────────────────────
  useEffect(() => {
    const cursors = new Map<
      string,
      { username: string; color: string; x: number; y: number }
    >();
    for (const user of onlineUsers) {
      // Don't render our own cursor
      if (user.userId === currentUserId) continue;
      if (user.cursor) {
        cursors.set(user.userId, {
          username: user.username,
          color: user.color,
          x: user.cursor.x,
          y: user.cursor.y,
        });
      }
    }
    setRemoteCursors(cursors);
  }, [onlineUsers, currentUserId]);

  // ─── Sticky Note Handlers ────────────────────────────────────────
  const handleStickyChange = useCallback(
    (updated: StickyElement) => {
      onDrawElement(updated);
    },
    [onDrawElement]
  );

  const handleStickyDelete = useCallback(
    (id: string) => {
      const el = elements.find((e) => e.id === id);
      if (el) {
        onPushUndo({ type: "DELETE", element: el });
        onDeleteElement(id);
        setSelectedElementId(null);
      }
    },
    [elements, onPushUndo, onDeleteElement]
  );

  const handleStickyPushModify = useCallback(
    (next: StickyElement, previous: StickyElement) => {
      onPushUndo({ type: "MODIFY", element: next, previousState: previous });
    },
    [onPushUndo]
  );

  // ─── Zoom Controls ───────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    zoomRef.current = Math.min(5, zoomRef.current * 1.2);
    setZoomDisplay(Math.round(zoomRef.current * 100));
    bumpViewport();
    render();
  }, [render, bumpViewport]);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = Math.max(0.1, zoomRef.current / 1.2);
    setZoomDisplay(Math.round(zoomRef.current * 100));
    bumpViewport();
    render();
  }, [render, bumpViewport]);

  const handleZoomReset = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoomDisplay(100);
    bumpViewport();
    render();
  }, [render, bumpViewport]);

  // ─── Minimap Navigation ──────────────────────────────────────────
  const handleMinimapNavigate = useCallback(
    (canvasX: number, canvasY: number) => {
      // Center viewport on the clicked canvas point
      const containerW = containerSize.width || window.innerWidth;
      const containerH = containerSize.height || window.innerHeight;
      panRef.current = {
        x: containerW / 2 - canvasX * zoomRef.current,
        y: containerH / 2 - canvasY * zoomRef.current,
      };
      bumpViewport();
      render();
    },
    [containerSize, render, bumpViewport]
  );

  // ─── Filter sticky elements for HTML overlay rendering ──────────
  const stickyElements = elements.filter(
    (e): e is StickyElement => e.type === "STICKY"
  );

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <>
      {/* Canvas Viewport */}
      <div
        ref={containerRef}
        className={`canvas-viewport ${isPanningRef.current ? "panning-active" : ""}`}
        style={{
          cursor:
            activeTool === "SELECT"
              ? "default"
              : activeTool === "TEXT"
              ? "text"
              : activeTool === "ERASER"
              ? "cell"
              : activeTool === "LASER"
              ? "crosshair"
              : activeTool === "STICKY"
              ? "copy"
              : "crosshair",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Sticky Notes Layer */}
        <div className="sticky-note-layer">
          <AnimatePresence>
            {stickyElements.map((sticky) => (
              <StickyNote
                key={sticky.id}
                element={sticky}
                zoom={zoomRef.current}
                panX={panRef.current.x}
                panY={panRef.current.y}
                selected={selectedElementId === sticky.id}
                onSelect={() => setSelectedElementId(sticky.id)}
                onChange={handleStickyChange}
                onDelete={() => handleStickyDelete(sticky.id)}
                onPushModify={handleStickyPushModify}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Remote Cursors */}
        {Array.from(remoteCursors.entries()).map(([userId, cursor]) => {
          const screen = canvasToScreen(
            cursor.x,
            cursor.y,
            panRef.current.x,
            panRef.current.y,
            zoomRef.current
          );
          return (
            <div
              key={userId}
              className="remote-cursor"
              style={{ left: screen.x, top: screen.y }}
            >
              <svg
                className="remote-cursor-pointer"
                viewBox="0 0 16 20"
                fill={cursor.color}
              >
                <path d="M0 0 L16 12 L8 12 L6 20 Z" />
              </svg>
              <span
                className="remote-cursor-label"
                style={{ backgroundColor: cursor.color }}
              >
                {cursor.username}
              </span>
            </div>
          );
        })}

        {/* Reactions Layer */}
        <ReactionsLayer
          reactions={reactions}
          zoom={zoomRef.current}
          panX={panRef.current.x}
          panY={panRef.current.y}
        />

        {/* Laser Layer (other users' pointers) */}
        <LaserLayer
          pointers={laserPointers}
          zoom={zoomRef.current}
          panX={panRef.current.x}
          panY={panRef.current.y}
        />
      </div>

      {/* Text Input Overlay */}
      {textInput && (
        <TextInputOverlay
          x={textInput.x}
          y={textInput.y}
          onCommit={handleTextCommit}
        />
      )}

      {/* Zoom Indicator */}
      <div className="zoom-indicator">
        <button className="zoom-btn" onClick={handleZoomOut} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-display" onClick={handleZoomReset} title="Reset zoom">
          {zoomDisplay}%
        </span>
        <button className="zoom-btn" onClick={handleZoomIn} aria-label="Zoom in">
          +
        </button>
      </div>

      {/* Minimap */}
      <Minimap
        elements={elements}
        panX={panRef.current.x}
        panY={panRef.current.y}
        zoom={zoomRef.current}
        viewportWidth={containerSize.width}
        viewportHeight={containerSize.height}
        onNavigateTo={handleMinimapNavigate}
      />
    </>
  );
}

// ─── Text Input Overlay Component ────────────────────────────────

function TextInputOverlay({
  x,
  y,
  onCommit,
}: {
  x: number;
  y: number;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCommit(text);
    } else if (e.key === "Escape") {
      onCommit("");
    }
  };

  const handleBlur = () => {
    onCommit(text);
  };

  return (
    <textarea
      ref={inputRef}
      className="text-input-overlay"
      style={{ left: x, top: y }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      rows={1}
      placeholder="Type here..."
    />
  );
}

export default DrawingBoard;
