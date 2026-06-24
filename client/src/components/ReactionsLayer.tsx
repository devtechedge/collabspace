import { motion, AnimatePresence } from "framer-motion";
import { Reaction } from "../types";

interface ReactionsLayerProps {
  reactions: Reaction[];
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Renders floating emoji reactions on the canvas.
 * Each reaction spawns at its (x, y) canvas-space position,
 * drifts upward ~140px (in screen-space), and fades out over ~2.5s.
 */
export default function ReactionsLayer({
  reactions,
  zoom,
  panX,
  panY,
}: ReactionsLayerProps) {
  return (
    <div className="reactions-layer">
      <AnimatePresence>
        {reactions.map((r) => {
          const screenX = r.x * zoom + panX;
          const screenY = r.y * zoom + panY;
          return (
            <motion.div
              key={r.id}
              className="reaction-burst"
              style={{ left: screenX, top: screenY }}
              initial={{ opacity: 0, scale: 0.3, y: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.3, 1.3, 1, 0.9],
                y: [0, -20, -100, -160],
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 2.5, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            >
              <span className="reaction-emoji">{r.emoji}</span>
              <span
                className="reaction-label"
                style={{ background: r.userColor }}
              >
                {r.username}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
