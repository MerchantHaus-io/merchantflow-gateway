import { useState, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const AI_CHANNEL_NAME = "atria-ai";
const AI_BOT_EMAIL = "ai-assistant@ops.internal";

export function AtriaFAB() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(true);

  // Stop pulsing after first open
  useEffect(() => {
    if (isOpen) setPulse(false);
  }, [isOpen]);

  // Get or find the atria-ai channel
  useEffect(() => {
    if (!user) return;
    supabase
      .from("chat_channels")
      .select("id")
      .eq("name", AI_CHANNEL_NAME)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setChannelId(data.id);
      });
  }, [user]);

  // Load recent messages when opened
  useEffect(() => {
    if (!isOpen || !channelId) return;
    supabase
      .from("chat_messages")
      .select("user_email, content")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) {
          setMessages(
            data.reverse().map((m) => ({
              role: m.user_email === AI_BOT_EMAIL ? "assistant" as const : "user" as const,
              content: m.content,
            }))
          );
        }
      });
  }, [isOpen, channelId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !user || !channelId || isThinking) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsThinking(true);

    // Signal Atria avatar to think (walk to whiteboard)
    window.dispatchEvent(new CustomEvent("atriaIntent", {
      detail: { reason: "thinking" },
    }));

    try {
      // Post user message to channel
      await supabase.from("chat_messages").insert({
        channel_id: channelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        content: userMsg,
      });

      // Trigger AI response
      await supabase.functions.invoke("ai-assistant", {
        body: { action: "chat", channelId, userMessage: userMsg },
      });

      // Fetch latest AI response
      const { data: latest } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("channel_id", channelId)
        .eq("user_email", AI_BOT_EMAIL)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        setMessages((prev) => [...prev, { role: "assistant", content: latest.content }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't respond right now. Try again in a moment." }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, user, channelId, isThinking]);

  if (!user) return null;

  return (
    <>
      {/* FAB Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed z-[100] h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-colors",
          isOpen
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          isMobile ? "bottom-20 right-4" : "bottom-6 right-72"
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        {pulse && !isOpen && (
          <span className="absolute inset-0 rounded-full animate-ping bg-primary/40" />
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={cn(
              "fixed z-[99] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden",
              isMobile
                ? "bottom-[4.5rem] right-3 left-3 h-[60vh]"
                : "bottom-20 right-72 w-[380px] h-[480px]"
            )}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Atria</p>
                <p className="text-[10px] text-muted-foreground">AI Assistant — always online</p>
              </div>
              {isThinking && (
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  thinking
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {messages.length === 0 && !isThinking && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-60">
                  <Bot className="h-10 w-10 text-primary/40" />
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    Ask me anything — pipeline status, SOP procedures, or tell me to create a deal, log a call, or run a validation.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed",
                    msg.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                      : "mr-auto bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {isThinking && (
                <div className="mr-auto bg-muted text-muted-foreground px-3 py-2 rounded-xl rounded-bl-sm text-sm flex items-center gap-1.5">
                  <span className="inline-flex gap-0.5">
                    <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-2.5 border-t border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Ask Atria anything…"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                  disabled={isThinking || !channelId}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isThinking || !channelId}
                  className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
