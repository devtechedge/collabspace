import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { StickyElement, CanvasElement, Point } from "../types";

interface StickyNoteProps {
  element: StickyElement;
  zoom: number;
  panX: number;
  panY: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (updated: StickyElement) => void;
  onDelete: () => void;
  onPushModify: (next: StickyElement, previous: StickyElement) => void;
  authorName?: string;
}

const STICKY_COLORS = [
  "#fde68a", // yellow
  "#fbcfe8", // pink
  "#bfdbfe", // blue
  "#bbf7d0", // green
  "#fed7aa", // orange
  "#ddd6fe", // purple
];

export default function StickyNote({
  element,
  zoom,
  panX,
  panY,
  selected,
  onSelect,
  onChange,
  onDelete,
  onPushModify,
  authorName,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localText, setLocalText] = useState(element.textContent);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number; elX: number; elY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasDraggedRef = useRef(false);

  // Sync local text if remote changes it
  useEffect(() => {
    if (!isEditing) setLocalText(element.textContent);
  }, [element.textContent, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const screenX = element.x * zoom + panX;
  const screenY = element.y * zoom + panY;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return; // allow text selection
      e.stopPropagation();
      onSelect();
      wasDraggedRef.current = false;
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        elX: element.x,
        elY: element.y,
      };
    },
    [element.x, element.y, isEditing, onSelect]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      if (Math.abs(e.clientX - dragStartRef.current.mouseX) > 2 || Math.abs(e.clientY - dragStartRef.current.mouseY) > 2) {
        wasDraggedRef.current = true;
      }
      const updated: StickyElement = {
        ...element,
        x: dragStartRef.current.elX + dx,
        y: dragStartRef.current.elY + dy,
      };
      onChange(updated);
    };

    const handleUp = () => {
      setIsDragging(false);
      if (wasDraggedRef.current && dragStartRef.current) {
        // Push undo entry for the drag
        onPushModify(
          { ...element, x: element.x, y: element.y },
          {
            ...element,
            x: dragStartRef.current.elX,
            y: dragStartRef.current.elY,
          }
        );
      }
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, element, zoom, onChange, onPushModify]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleTextBlur = useCallback(() => {
    setIsEditing(false);
    if (localText !== element.textContent) {
      const previous = { ...element };
      const updated: StickyElement = { ...element, textContent: localText };
      onPushModify(updated, previous);
      onChange(updated);
    }
  }, [localText, element, onChange, onPushModify]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLocalText(element.textContent);
        setIsEditing(false);
      }
      e.stopPropagation();
    },
    [element.textContent]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      const previous = { ...element };
      const updated: StickyElement = { ...element, color };
      onPushModify(updated, previous);
      onChange(updated);
    },
    [element, onChange, onPushModify]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  return (
    <motion.div
      className={`sticky-note ${isDragging ? "dragging" : ""} ${selected ? "selected" : ""}`}
      style={{
        left: screenX,
        top: screenY,
        transform: `scale(${zoom})`,
        background: element.color,
        fontWeight: element.fontWeight === "bold" ? 700 : 400,
      }}
      initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
      animate={{ opacity: 1, scale: zoom, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.5, rotate: 12, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Color picker (visible when selected) */}
      <div className="sticky-note-color-picker" onMouseDown={(e) => e.stopPropagation()}>
        {STICKY_COLORS.map((c) => (
          <button
            key={c}
            className={`sticky-color-swatch ${element.color === c ? "active" : ""}`}
            style={{ background: c }}
            onClick={() => handleColorChange(c)}
            aria-label={`Set sticky color ${c}`}
          />
        ))}
      </div>

      {/* Delete button */}
      <button
        className="sticky-note-delete"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleDeleteClick}
        aria-label="Delete sticky note"
      >
        ×
      </button>

      {/* Editable text */}
      <textarea
        ref={textareaRef}
        className="sticky-note-text"
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onBlur={handleTextBlur}
        onKeyDown={handleTextKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        readOnly={!isEditing}
        placeholder="Type your note…"
        rows={4}
      />

      {/* Author tag */}
      {authorName && <div className="sticky-note-author">{authorName.slice(0, 12)}</div>}
    </motion.div>
  );
}

// Re-export for type narrowing elsewhere
export type { CanvasElement, Point };
