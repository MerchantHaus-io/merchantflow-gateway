import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Clock } from "lucide-react";

interface Popup {
  id: string;
  title: string;
  content: string;
  min_display_seconds: number;
}

export function AdminPopupDisplay() {
  const { user } = useAuth();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);

  const fetchPendingPopup = useCallback(async () => {
    if (!user) return;

    // Get all active popups
    const { data: popups } = await supabase
      .from("admin_popups")
      .select("id, title, content, min_display_seconds")
      .eq("is_active", true);

    if (!popups || popups.length === 0) return;

    // Get user's acknowledged popups
    const { data: acked } = await supabase
      .from("admin_popup_acknowledgments")
      .select("popup_id")
      .eq("user_id", user.id);

    const ackedIds = new Set((acked || []).map((a: unknown) => a.popup_id));
    const pending = (popups as Popup[]).find((p) => !ackedIds.has(p.id));

    if (pending) {
      setPopup(pending);
      setCountdown(pending.min_display_seconds);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(fetchPendingPopup, 2000);
    return () => clearTimeout(timer);
  }, [fetchPendingPopup]);

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const acknowledge = async () => {
    if (!popup || !user || countdown > 0) return;
    setAcknowledging(true);
    await supabase.from("admin_popup_acknowledgments").insert({
      popup_id: popup.id,
      user_id: user.id,
      user_email: user.email || "",
    });
    setPopup(null);
    setAcknowledging(false);
    // Check for more
    fetchPendingPopup();
  };

  if (!popup) return null;

  return (
    <Dialog open={!!popup} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            {popup.title}
          </DialogTitle>
          <DialogDescription className="sr-only">Important notification</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {popup.content}
          </div>
          <div className="flex items-center justify-between pt-2">
            {countdown > 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Please read carefully — {countdown}s remaining
              </div>
            ) : (
              <div />
            )}
            <Button
              onClick={acknowledge}
              disabled={countdown > 0 || acknowledging}
              className="gap-2"
            >
              {countdown > 0 ? `Wait ${countdown}s` : "I have read this"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
