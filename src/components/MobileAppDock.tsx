import { useState, useRef, useEffect, useCallback } from "react";
import { ClipboardCheck, Phone, MessageCircle, Gamepad2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mobile-dock-position";
const DEFAULT_POS = { x: 16, y: -80 }; // left:16, bottom:80

interface DockPosition {
  x: number;
  y: number; // stored as negative bottom offset
}

function loadPosition(): DockPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_POS;
}

function savePosition(pos: DockPosition) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
}

const FAN_ITEMS = [
  { id: "notice", icon: ClipboardCheck, label: "Notice Board", event: "openNoticeBoard" },
  { id: "dialler", icon: Phone, label: "Dialler", event: "openDialler" },
  { id: "chat", icon: MessageCircle, label: "Chat", event: "openFloatingChat" },
  { id: "simulator", icon: Gamepad2, label: "Simulator", event: "openOfficeSimulator" },
];

// Fan positions — vertical stack above the FAB
const FAN_OFFSETS = [
  { x: 0, y: -64 },   // closest
  { x: 0, y: -120 },  // middle
  { x: 0, y: -176 },  // farthest
  { x: 0, y: -232 },  // fourth item
];

export function MobileAppDock() {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<DockPosition>(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [longPressed, setLongPressed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    startTime: number;
    moved: boolean;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // Hide dock when any sub-app opens, show when it closes
  useEffect(() => {
    const hide = () => { setHidden(true); setIsOpen(false); };
    const show = () => setHidden(false);
    window.addEventListener("dockAppOpened", hide);
    window.addEventListener("dockAppClosed", show);
    return () => {
      window.removeEventListener("dockAppOpened", hide);
      window.removeEventListener("dockAppClosed", show);
    };
  }, []);

  // Close fan on outside tap
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: TouchEvent | MouseEvent) => {
      if (tabRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener("touchstart", handler, { passive: true });
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      startTime: Date.now(),
      moved: false,
    };
    // Start long-press timer (500ms)
    longPressTimer.current = setTimeout(() => {
      setLongPressed(true);
      setIsDragging(true);
      setIsOpen(false);
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, [pos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.startX;
    const dy = touch.clientY - dragRef.current.startY;

    // Cancel long-press if finger moves before timer fires
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    // Only allow dragging after long press
    if (!longPressed && !isDragging) return;

    dragRef.current.moved = true;
    const newX = Math.max(0, Math.min(window.innerWidth - 56, dragRef.current.startPosX + dx));
    const newY = Math.max(-(window.innerHeight - 56), Math.min(-16, dragRef.current.startPosY + dy));
    setPos({ x: newX, y: newY });
  }, [longPressed, isDragging]);

  const handleTouchEnd = useCallback(() => {
    // Clear long-press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!dragRef.current) return;
    const wasDrag = dragRef.current.moved || isDragging;
    dragRef.current = null;
    setIsDragging(false);
    setLongPressed(false);

    if (wasDrag) {
      savePosition(pos);
    } else {
      setIsOpen((o) => !o);
    }
  }, [pos, isDragging]);

  const handleFanItemTap = useCallback((eventName: string) => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent(eventName));
  }, []);

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed z-[55]"
          style={{
            left: pos.x,
            bottom: -pos.y,
            touchAction: "none",
          }}
        >
      {/* Fan items */}
      <AnimatePresence>
        {isOpen && FAN_ITEMS.map((item, i) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
            animate={{
              opacity: 1,
              x: FAN_OFFSETS[i].x,
              y: FAN_OFFSETS[i].y,
              scale: 1,
            }}
            exit={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className={cn(
              "absolute w-12 h-12 rounded-full flex items-center justify-center",
              "bg-card border border-border text-foreground shadow-xl",
              "active:scale-95 transition-transform"
            )}
            onClick={() => handleFanItemTap(item.event)}
            aria-label={item.label}
          >
            <item.icon className="h-5 w-5" />
          </motion.button>
        ))}
      </AnimatePresence>

      {/* Main tab */}
      <button
        ref={tabRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          // Desktop fallback
          if (!("ontouchstart" in window)) setIsOpen((o) => !o);
        }}
        className={cn(
          "relative w-14 h-14 rounded-full flex items-center justify-center",
          "bg-haus-charcoal text-white shadow-xl",
          "transition-all duration-200",
          isDragging && "scale-110 shadow-2xl",
          isOpen && "ring-2 ring-gold/50"
        )}
        aria-label="App tools"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
          </svg>
        </motion.div>

        {/* Hold hint */}
        {isDragging && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-foreground text-background px-2 py-0.5 rounded whitespace-nowrap">
            Drop to place
          </span>
        )}
      </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
