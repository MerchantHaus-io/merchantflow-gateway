import { useEffect, useState } from "react";
import { ClipboardCheck, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * PersistentTriTabDock
 * Single centered dock at bottom of the viewport with three tabs:
 *   [ Notice Board | Messaging | Quo Dialler ]
 * Messaging sits in the middle. Clicking a tab dispatches the corresponding
 * global open event that the existing panels already listen for.
 * Persists across all authenticated routes.
 */
export function PersistentTriTabDock() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [anyOpen, setAnyOpen] = useState(false);
  const [unreadNotice, setUnreadNotice] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Hide when any panel is open so it doesn't fight with the expanded window.
  useEffect(() => {
    const opened = () => setAnyOpen(true);
    const closed = () => setAnyOpen(false);
    window.addEventListener("dockAppOpened", opened);
    window.addEventListener("dockAppClosed", closed);
    return () => {
      window.removeEventListener("dockAppOpened", opened);
      window.removeEventListener("dockAppClosed", closed);
    };
  }, []);

  // Notice board unread (active action items)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("completed", false);
      if (!cancelled) setUnreadNotice(count ?? 0);
    };
    load();
    const channel = supabase
      .channel("tri-tab-notice")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Messaging unread (direct + channel messages) — light-touch: rely on custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      if (detail && typeof detail.count === "number") setUnreadMessages(detail.count);
    };
    window.addEventListener("messagingUnreadCount", handler as EventListener);
    return () => window.removeEventListener("messagingUnreadCount", handler as EventListener);
  }, []);

  if (!user || isMobile || anyOpen) return null;

  const fire = (event: string) => window.dispatchEvent(new CustomEvent(event));

  const tabBase =
    "group relative flex items-center gap-2 h-11 px-4 text-sm font-semibold transition-all duration-200 ease-out border border-b-0 border-border";

  return (
    <div
      className="fixed bottom-0 lg:bottom-0 left-1/2 -translate-x-1/2 z-[55] flex items-end shadow-2xl rounded-t-xl overflow-hidden"
      style={{ bottom: "calc(var(--tri-tab-dock-offset, 0px) + env(safe-area-inset-bottom, 0px))" }}
      role="toolbar"
      aria-label="Persistent workspace tabs"
    >
      {/* Notice Board */}
      <button
        onClick={() => fire("openNoticeBoard")}
        className={cn(
          tabBase,
          "bg-card text-card-foreground hover:brightness-110 rounded-tl-xl",
        )}
        aria-label="Open notice board"
      >
        <ClipboardCheck className="h-5 w-5 shrink-0" />
        <span>Notice Board</span>
        {unreadNotice > 0 && (
          <span className="ml-1 bg-gold text-haus-charcoal text-xs font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
            {unreadNotice > 99 ? "99+" : unreadNotice}
          </span>
        )}
      </button>

      {/* Messaging — center, emphasized */}
      <button
        onClick={() => fire("openFloatingChat")}
        className={cn(
          tabBase,
          "bg-[hsl(var(--wa-header))] text-[hsl(var(--wa-header-foreground))] hover:brightness-110 px-6 -mt-1 h-12 border-[hsl(var(--wa-divider))]",
        )}
        aria-label="Open messaging"
      >
        <MessageCircle className="h-5 w-5 shrink-0" />
        <span>Messaging</span>
        {unreadMessages > 0 && (
          <span className="ml-1 bg-[hsl(var(--wa-unread)/0.3)] text-[hsl(var(--wa-header-foreground))] text-xs font-medium min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
            {unreadMessages > 99 ? "99+" : unreadMessages}
          </span>
        )}
      </button>

      {/* Quo Dialler */}
      <button
        onClick={() => fire("openDialler")}
        className={cn(
          tabBase,
          "bg-accent text-accent-foreground hover:brightness-110 rounded-tr-xl",
        )}
        aria-label="Open Quo dialler"
      >
        <Phone className="h-5 w-5 shrink-0" />
        <span>Quo Dialler</span>
      </button>
    </div>
  );
}

export default PersistentTriTabDock;
