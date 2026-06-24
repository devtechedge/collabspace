import { motion, AnimatePresence } from "framer-motion";
import { Tool } from "../types";

interface ToolbarProps {
  activeTool: Tool;
  activeColor: string;
  activeFontWeight: string;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onFontWeightChange: (weight: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReaction: (emoji: string) => void;
  undoAvailable: boolean;
  redoAvailable: boolean;
}

const COLORS = [
  "#ffffff",
  "#6366f1",
  "#818cf8",
  "#f43f5e",
  "#fb923c",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

const TOOLS: { tool: Tool; icon: string; label: string; shortcut: string }[] = [
  { tool: "SELECT", icon: "▲", label: "Select / Move", shortcut: "V" },
  { tool: "PENCIL", icon: "✏", label: "Pencil", shortcut: "P" },
  { tool: "ERASER", icon: "⊘", label: "Eraser", shortcut: "E" },
  { tool: "LINE", icon: "╱", label: "Line", shortcut: "L" },
  { tool: "RECTANGLE", icon: "▭", label: "Rectangle", shortcut: "R" },
  { tool: "CIRCLE", icon: "◯", label: "Circle", shortcut: "C" },
  { tool: "TEXT", icon: "T", label: "Text", shortcut: "T" },
  { tool: "STICKY", icon: "▣", label: "Sticky Note", shortcut: "N" },
  { tool: "LASER", icon: "◉", label: "Laser Pointer", shortcut: "X" },
];

const REACTION_EMOJIS = ["🎉", "👍", "❤️", "💡", "🚀", "🔥"];

function Toolbar({
  activeTool,
  activeColor,
  activeFontWeight,
  onToolChange,
  onColorChange,
  onFontWeightChange,
  onUndo,
  onRedo,
  onReaction,
  undoAvailable,
  redoAvailable,
}: ToolbarProps) {
  return (
    <>
      <motion.div
        className="toolbar"
        role="toolbar"
        aria-label="Drawing tools"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
      >
        {/* Drawing Tools */}
        <div className="toolbar-section">
          <span className="toolbar-section-label">Tools</span>
          {TOOLS.map(({ tool, icon, label, shortcut }, i) => (
            <motion.button
              key={tool}
              className={`tool-btn ${activeTool === tool ? "active" : ""}`}
              onClick={() => onToolChange(tool)}
              data-tooltip={`${label}  ·  ${shortcut}`}
              aria-label={label}
              aria-pressed={activeTool === tool}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 300, damping: 22 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
            >
              <span className="tool-icon">{icon}</span>
              <span className="shortcut-hint">{shortcut}</span>
            </motion.button>
          ))}
        </div>

        {/* Colors */}
        <div className="toolbar-section">
          <span className="toolbar-section-label">Color</span>
          <div className="color-picker-row">
            {COLORS.map((color) => (
              <motion.button
                key={color}
                className={`color-swatch ${activeColor === color ? "active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => onColorChange(color)}
                aria-label={`Color ${color}`}
                title={color}
                whileHover={{ scale: 1.25, rotate: 8 }}
                whileTap={{ scale: 0.9 }}
              />
            ))}
          </div>
        </div>

        {/* Text Weight (only shown for TEXT tool) */}
        <AnimatePresence>
          {activeTool === "TEXT" && (
            <motion.div
              className="toolbar-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="toolbar-section-label">Weight</span>
              <motion.button
                className={`tool-btn font-btn ${activeFontWeight === "normal" ? "active" : ""}`}
                onClick={() => onFontWeightChange("normal")}
                aria-label="Normal weight"
                aria-pressed={activeFontWeight === "normal"}
                title="Normal weight"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
              >
                A
              </motion.button>
              <motion.button
                className={`tool-btn font-btn font-btn-bold ${activeFontWeight === "bold" ? "active" : ""}`}
                onClick={() => onFontWeightChange("bold")}
                aria-label="Bold weight"
                aria-pressed={activeFontWeight === "bold"}
                title="Bold weight"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
              >
                A
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="toolbar-section">
          <span className="toolbar-section-label">Actions</span>
          <motion.button
            className="tool-btn"
            onClick={onUndo}
            data-tooltip="Undo  ·  ⌘Z"
            aria-label="Undo"
            disabled={!undoAvailable}
            whileHover={undoAvailable ? { scale: 1.05 } : undefined}
            whileTap={undoAvailable ? { scale: 0.92 } : undefined}
          >
            <span className="tool-icon">↩</span>
            <span className="shortcut-hint">⌘Z</span>
          </motion.button>
          <motion.button
            className="tool-btn"
            onClick={onRedo}
            data-tooltip="Redo  ·  ⌘⇧Z"
            aria-label="Redo"
            disabled={!redoAvailable}
            whileHover={redoAvailable ? { scale: 1.05 } : undefined}
            whileTap={redoAvailable ? { scale: 0.92 } : undefined}
          >
            <span className="tool-icon">↪</span>
            <span className="shortcut-hint">⌘⇧Z</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Floating Reactions Launcher */}
      <motion.div
        className="reactions-launcher"
        role="toolbar"
        aria-label="Reactions"
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.4 }}
      >
        {REACTION_EMOJIS.map((emoji, i) => (
          <motion.button
            key={emoji}
            className="reaction-btn"
            onClick={() => onReaction(emoji)}
            aria-label={`Send ${emoji} reaction`}
            title={`Send ${emoji}`}
            whileHover={{ scale: 1.35, rotate: -10 }}
            whileTap={{ scale: 0.85 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.04 }}
          >
            {emoji}
          </motion.button>
        ))}
      </motion.div>
    </>
  );
}

export default Toolbar;
