import { useRef, useEffect } from "react";
import { CanvasElement, Point } from "../types";

interface MinimapProps {
  elements: CanvasElement[];
  panX: number;
  panY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  onNavigateTo: (canvasX: number, canvasY: number) => void;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 130;

/**
 * Bottom-right canvas overview.
 * Renders all elements scaled to fit, plus a viewport rectangle indicator.
 * Click anywhere on the minimap to center the viewport on that canvas position.
 */
export default function Minimap({
  elements,
  panX,
  panY,
  zoom,
  viewportWidth,
  viewportHeight,
  onNavigateTo,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute content bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    let bx = el.x, by = el.y, bw = el.width, bh = el.height;
    if (el.type === "PENCIL" || el.type === "ERASER") {
      if (el.points && el.points.length > 0) {
        const xs = el.points.map((p) => p.x);
        const ys = el.points.map((p) => p.y);
        bx = Math.min(...xs);
        by = Math.min(...ys);
        bw = Math.max(...xs) - bx;
        bh = Math.max(...ys) - by;
      } else continue;
    }
    if (bw === 0 && bh === 0 && el.type !== "TEXT" && el.type !== "STICKY") continue;
    if (el.type === "STICKY") {
      bw = 180; bh = 140;
    }
    if (el.type === "TEXT") {
      bw = Math.max(bw, 80);
      bh = Math.max(bh, 20);
    }
    minX = Math.min(minX, bx);
    minY = Math.min(minY, by);
    maxX = Math.max(maxX, bx + bw);
    maxY = Math.max(maxY, by + bh);
  }

  // Include current viewport in bounds so the viewport rectangle is always visible
  const viewCanvasX = -panX / zoom;
  const viewCanvasY = -panY / zoom;
  const viewCanvasW = viewportWidth / zoom;
  const viewCanvasH = viewportHeight / zoom;
  minX = Math.min(minX, viewCanvasX);
  minY = Math.min(minY, viewCanvasY);
  maxX = Math.max(maxX, viewCanvasX + viewCanvasW);
  maxY = Math.max(maxY, viewCanvasY + viewCanvasH);

  // Fallback if no content
  if (!isFinite(minX)) {
    minX = -500; minY = -500; maxX = 500; maxY = 500;
  }
  // Add padding
  const padX = (maxX - minX) * 0.08 || 50;
  const padY = (maxY - minY) * 0.08 || 50;
  minX -= padX; minY -= padY; maxX += padX; maxY += padY;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scale = Math.min(MINIMAP_WIDTH / contentW, MINIMAP_HEIGHT / contentH);

  const toMinimap = (cx: number, cy: number): Point => ({
    x: (cx - minX) * scale,
    y: (cy - minY) * scale,
  });

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Background grid hint
    ctx.fillStyle = "rgba(148, 163, 184, 0.05)";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw elements
    for (const el of elements) {
      ctx.save();
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.85;

      switch (el.type) {
        case "PENCIL":
        case "ERASER": {
          if (el.points && el.points.length > 1) {
            ctx.beginPath();
            const p0 = toMinimap(el.points[0].x, el.points[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < el.points.length; i++) {
              const p = toMinimap(el.points[i].x, el.points[i].y);
              ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          }
          break;
        }
        case "LINE": {
          const a = toMinimap(el.x, el.y);
          const b = toMinimap(el.x + el.width, el.y + el.height);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          break;
        }
        case "RECTANGLE": {
          const a = toMinimap(el.x, el.y);
          ctx.strokeRect(a.x, a.y, Math.abs(el.width * scale), Math.abs(el.height * scale));
          break;
        }
        case "CIRCLE": {
          const c = toMinimap(el.x + el.width / 2, el.y + el.height / 2);
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, Math.abs(el.width * scale / 2), Math.abs(el.height * scale / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "TEXT": {
          const a = toMinimap(el.x, el.y);
          ctx.fillRect(a.x, a.y, Math.max(8, Math.min(20, (el.width || 80) * scale)), Math.max(3, 6 * scale));
          break;
        }
        case "STICKY": {
          const a = toMinimap(el.x, el.y);
          ctx.fillStyle = el.color;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(a.x, a.y, 180 * scale, 140 * scale);
          break;
        }
      }
      ctx.restore();
    }

    // Draw viewport rectangle
    const vpA = toMinimap(viewCanvasX, viewCanvasY);
    const vpW = viewCanvasW * scale;
    const vpH = viewCanvasH * scale;
    ctx.save();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.9)";
    ctx.fillStyle = "rgba(99, 102, 241, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(vpA.x, vpA.y, vpW, vpH);
    ctx.strokeRect(vpA.x, vpA.y, vpW, vpH);
    ctx.restore();
  }, [elements, panX, panY, zoom, viewportWidth, viewportHeight, scale, minX, minY]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Convert minimap coords back to canvas coords
    const cx = mx / scale + minX;
    const cy = my / scale + minY;
    onNavigateTo(cx, cy);
  };

  return (
    <div className="minimap" role="button" tabIndex={0} aria-label="Minimap — click to navigate">
      <span className="minimap-label">Overview</span>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      />
    </div>
  );
}
