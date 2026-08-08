import { useState, useRef, useEffect, useCallback } from "react";
import { ClipboardCheck, Phone, MessageCircle, Gamepad2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { emitAppEvent, useAppEvent, type AppEventName } from "@/lib/appEvents";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mobile-dock-position";

const FAB_SIZE = 56;
const FAN_ITEM_SIZE = 48;
const FAN_SPACING = 56;
const EDGE_MARGIN = 16;
/** Height of the fixed tab bar the dock must never cover. */
const TAB_BAR_HEIGHT = 56;

interface DockPosition {
  /** Distance from the left edge, in px. */
  x: number;
  /** Distance from the bottom edge, in px. */
  bottom: number;
}

const DEFAULT_POS: DockPosition = { x: EDGE_MARGIN, bottom: 80 };

function safeAreaBottom(): number {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom");
  return Number.parseFloat(raw) || 0;
}

/**
 * Keep the dock on screen and clear of the tab bar.
 *
 * The stored position is absolute pixels, and the old code only clamped while
 * a drag was in progress. Rotate the device or open the app on a narrower
 * phone and the FAB could sit half — or entirely — off screen, with no way to
 * get it back (#141). The lower bound also allowed 16px, which parks it on top
 * of the 56px tab bar and can permanently cover a primary tab (#142).
 */
function clamp(pos: DockPosition): DockPosition {
  const minBottom = TAB_BAR_HEIGHT + safeAreaBottom() + 8;
  const maxBottom = Math.max(minBottom, window.innerHeight - FAB_SIZE - EDGE_MARGIN);
  return {
    x: Math.max(EDGE_MARGIN, Math.min(window.innerWidth - FAB_SIZE - EDGE_MARGIN, pos.x)),
    bottom: Math.max(minBottom, Math.min(maxBottom, pos.bottom)),
  };
}

/** Settle to whichever side is nearer, the way every floating-bubble UI does. */
function snapToEdge(pos: DockPosition): DockPosition {
  const midpoint = window.innerWidth / 2;
  const centre = pos.x + FAB_SIZE / 2;
  return clamp({
    ...pos,
    x: centre < midpoint ? EDGE_MARGIN : window.innerWidth - FAB_SIZE - EDGE_MARGIN,
  });
}

function loadPosition(): DockPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POS;
    const parsed = JSON.parse(raw) as Partial<DockPosition>;
    if (typeof parsed?.x !== "number" || typeof parsed?.bottom !== "number") return DEFAULT_POS;
    return parsed as DockPosition;
  } catch {
    return DEFAULT_POS;
  }
}

function savePosition(pos: DockPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* private mode / quota */
  }
}

const FAN_ITEMS: { id: string; icon: typeof Phone; label: string; event: AppEventName }[] = [
  { id: "notice", icon: ClipboardCheck, label: "Notice Board", event: "openNoticeBoard" },
  { id: "dialler", icon: Phone, label: "Dialler", event: "openDialler" },
  { id: "chat", icon: MessageCircle, label: "Chat", event: "openFloatingChat" },
  { id: "simulator", icon: Gamepad2, label: "Simulator", event: "openOfficeSimulator" },
];

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 8;

export function MobileAppDock() {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<DockPosition>(loadPosition);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPos: DockPosition;
    moved: boolean;
    dragging: boolean;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // Clamp whatever was restored from storage, and again whenever the viewport
  // changes — rotation is the common case.
  useEffect(() => {
    const reclamp = () => setPos((p) => clamp(p));
    reclamp();
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
  }, []);

  useAppEvent("dockAppOpened", useCallback(() => setIsOpen(false), []));

  // Close the fan on an outside press.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      if (tabRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [isOpen]);

  // Pointer events throughout, rather than a touch/mouse split (#144). The old
  // click handler was guarded by `!("ontouchstart" in window)`, but
  // touch-capable laptops and most Android browsers report ontouchstart AND
  // fire a click after touchend — so the fan toggled twice and appeared not to
  // open at all.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startPos: pos,
        moved: false,
        dragging: false,
      };

      // Mouse users get drag on press; touch users must hold, so a tap stays a
      // tap and a scroll stays a scroll.
      if (e.pointerType === "mouse") return;
      longPressTimer.current = setTimeout(() => {
        if (!dragRef.current) return;
        dragRef.current.dragging = true;
        setIsDragging(true);
        setIsOpen(false);
        navigator.vibrate?.(30);
      }, LONG_PRESS_MS);
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (e.pointerType === "mouse") {
        drag.dragging = true;
        setIsDragging(true);
      }
    }

    if (!drag.dragging) return;
    drag.moved = true;
    // bottom grows upward, so a downward drag (positive dy) reduces it.
    setPos(clamp({ x: drag.startPos.x + dx, bottom: drag.startPos.bottom - dy }));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const wasDrag = drag.dragging && drag.moved;
      setIsDragging(false);

      if (wasDrag) {
        setPos((p) => {
          const snapped = snapToEdge(p);
          savePosition(snapped);
          return snapped;
        });
      } else {
        setIsOpen((o) => !o);
      }
    },
    [],
  );

  const handleFanItemTap = useCallback((eventName: AppEventName) => {
    setIsOpen(false);
    emitAppEvent(eventName);
  }, []);

  // Flip the fan downward when there isn't room above (#143). Four items stack
  // to 232px, so dragging the dock near the top of the screen rendered most of
  // them off-screen with no way to reach them.
  const stackHeight = FAN_ITEMS.length * FAN_SPACING;
  const spaceAbove =
    typeof window === "undefined" ? Infinity : window.innerHeight - pos.bottom - FAB_SIZE;
  const flipDown = spaceAbove < stackHeight + EDGE_MARGIN;
  const direction = flipDown ? 1 : -1;

  return (
    <div
      className="fixed z-dock"
      style={{ left: pos.x, bottom: pos.bottom, touchAction: "none" }}
    >
      <AnimatePresence>
        {isOpen &&
          FAN_ITEMS.map((item, i) => (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, y: 0, scale: 0.3 }}
              animate={{
                opacity: 1,
                y: direction * ((i + 1) * FAN_SPACING + 8),
                scale: 1,
              }}
              exit={{ opacity: 0, y: 0, scale: 0.3 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              style={{ width: FAN_ITEM_SIZE, height: FAN_ITEM_SIZE }}
              className={cn(
                "absolute rounded-full flex items-center justify-center",
                "bg-card border border-border text-foreground shadow-xl",
                "active:scale-95 transition-transform",
              )}
              onClick={() => handleFanItemTap(item.event)}
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5" />
            </motion.button>
          ))}
      </AnimatePresence>

      <button
        ref={tabRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ width: FAB_SIZE, height: FAB_SIZE }}
        className={cn(
          "relative rounded-full flex items-center justify-center",
          "bg-haus-charcoal text-white shadow-xl transition-all duration-200",
          isDragging && "scale-110 shadow-2xl",
          isOpen && "ring-2 ring-gold/50",
        )}
        aria-label="App tools"
        aria-expanded={isOpen}
      >
        <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
            <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
          </svg>
        </motion.span>

        {isDragging && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-foreground text-background px-2 py-0.5 rounded whitespace-nowrap">
            Drop to place
          </span>
        )}
      </button>
    </div>
  );
}
