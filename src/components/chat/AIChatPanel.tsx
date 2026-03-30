import React, { useState, useEffect, useCallback, useRef } from "react";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const AI_CHANNEL_NAME = "atria-ai";
const AI_BOT_EMAIL = "ai-assistant@ops.internal";

export const AIChatPanel: React.FC = () => {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!channelId) return;
    supabase
      .from("chat_messages")
      .select("user_email, content")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setMessages(
            data.reverse().map((m) => ({
              role: m.user_email === AI_BOT_EMAIL ? ("assistant" as const) : ("user" as const),
              content: m.content,
            }))
          );
        }
      });
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !user || !channelId || isThinking) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsThinking(true);

    try {
      await supabase.from("chat_messages").insert({
        channel_id: channelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        content: userMsg,
      });

      await supabase.functions.invoke("ai-assistant", {
        body: { action: "chat", channelId, userMessage: userMsg },
      });

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
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't respond right now. Try again in a moment." },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [input, user, channelId, isThinking]);

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[hsl(var(--wa-divider))] bg-[hsl(var(--wa-sidebar-bg))] flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <span className="font-semibold text-sm text-[hsl(var(--wa-bubble-in-foreground))]">Atria AI</span>
          <span className="text-xs text-[hsl(var(--wa-meta))] ml-2">always online</span>
        </div>
        {isThinking && (
          <div className="ml-auto flex items-center gap-1 text-xs text-[hsl(var(--wa-meta))]">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[hsl(var(--wa-chat-bg))]">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-60">
            <Bot className="h-10 w-10 text-primary/40" />
            <p className="text-xs text-[hsl(var(--wa-meta))] max-w-[240px]">
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
                ? "ml-auto bg-[hsl(var(--wa-bubble-out))] text-[hsl(var(--wa-bubble-out-foreground))] rounded-br-sm"
                : "mr-auto bg-[hsl(var(--wa-bubble-in))] text-[hsl(var(--wa-bubble-in-foreground))] rounded-bl-sm"
            )}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {isThinking && (
          <div className="mr-auto bg-[hsl(var(--wa-bubble-in))] text-[hsl(var(--wa-meta))] px-3 py-2 rounded-xl rounded-bl-sm text-sm flex items-center gap-1.5">
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 bg-[hsl(var(--wa-meta))] rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 bg-[hsl(var(--wa-meta))] rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 bg-[hsl(var(--wa-meta))] rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-[hsl(var(--wa-divider))] bg-[hsl(var(--wa-sidebar-bg))]">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask Atria anything…"
            className="flex-1 bg-[hsl(var(--wa-search-bg))] border-0 rounded-lg px-3 py-2 text-sm outline-none text-[hsl(var(--wa-bubble-in-foreground))] placeholder:text-[hsl(var(--wa-meta))] focus:ring-1 focus:ring-primary/50"
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
    </div>
  );
};
