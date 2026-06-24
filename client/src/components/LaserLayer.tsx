import { motion, AnimatePresence } from "framer-motion";
import type { CSSProperties } from "react";
import { LaserPointer } from "../types";

interface LaserLayerProps {
  pointers: LaserPointer[];
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Renders other users' laser pointers as pulsing dots on the canvas.
 * Each pointer auto-expires after ~1.4s of inactivity (handled by parent).
 */
export default function LaserLayer({ pointers, zoom, panX, panY }: LaserLayerProps) {
  return (
    <div className="laser-layer">
      <AnimatePresence>
        {pointers.map((p) => {
          const screenX = p.x * zoom + panX;
          const screenY = p.y * zoom + panY;
          // Per-user laser color is set as a CSS custom property so the
          // .laser-pointer::before/::after pseudo-elements can pick it up.
          const style = {
            left: screenX,
            top: screenY,
            "--laser-color": p.color,
          } as CSSProperties;
          return (
            <motion.div
              key={p.userId}
              className="laser-pointer"
              style={style}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.18 }}
            >
              <span className="laser-label">{p.username}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
