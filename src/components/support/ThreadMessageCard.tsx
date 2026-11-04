import { useState, type ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { messagePreview, splitQuotedText } from "@/lib/support";

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

export type ThreadMessage = {
  id: string;
  authorName: string;
  badge: "requester" | "internal" | null;
  tone: "customer" | "agent" | "internal";
  at: string;
  /** Absolute date for the opening message, relative for replies. */
  absoluteTime: boolean;
  body: string;
  linkify: boolean;
  emptyText?: string;
};

// Bodies longer than this are clamped until "Show full message" is clicked.
const LONG_MESSAGE_CHARS = 1200;

export function ThreadMessageCard({
  message,
  expanded,
  onToggle,
  render,
}: {
  message: ThreadMessage;
  expanded: boolean;
  onToggle: () => void;
  render: (text: string) => ReactNode;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const { main, quoted } = splitQuotedText(message.body);
  const long = main.length > LONG_MESSAGE_CHARS;
  const at = new Date(message.at);
  const time = message.absoluteTime
    ? format(at, at.getFullYear() === new Date().getFullYear() ? "MMM d · h:mm a" : "MMM d, yyyy · h:mm a")
    : formatDistanceToNow(at, { addSuffix: true });

  return (
    <div
      className={cn(
        "rounded-lg border min-w-0",
        message.tone === "internal"
          ? "border-amber-500/40 bg-amber-500/5"
          : message.tone === "customer"
            ? "border-border bg-muted/40"
            : "border-primary/30 bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full min-w-0 flex items-center gap-2 p-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback
            className={cn(
              "text-[9px]",
              message.tone === "customer" ? "bg-primary/10 text-primary" : "bg-muted",
            )}
          >
            {initials(message.authorName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate min-w-[3.5rem] max-w-[45%] sm:max-w-none sm:shrink-0">
          {message.authorName}
        </span>
        {message.badge === "internal" && (
          <Badge
            variant="outline"
            className="text-[10px] gap-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400 shrink-0"
          >
            <Lock className="h-2.5 w-2.5" />
            Internal
          </Badge>
        )}
        {message.badge === "requester" && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            Requester
          </Badge>
        )}
        {!expanded && (
          <span className="hidden sm:block text-xs text-muted-foreground truncate min-w-0 flex-1">
            {messagePreview(message.body) || message.emptyText}
          </span>
        )}
        <span
          className="text-xs text-muted-foreground ml-auto shrink-0 whitespace-nowrap"
          title={format(at, "PPpp")}
        >
          {time}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 -mt-1">
          <div
            className={cn(
              "text-sm text-foreground/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
              long && !showFull && "line-clamp-[14]",
            )}
          >
            {main ? (
              message.linkify ? render(main) : main
            ) : (
              <span className="text-muted-foreground italic">{message.emptyText}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {long && (
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                {showFull ? "Show less" : "Show full message"}
              </button>
            )}
            {quoted && (
              <button
                type="button"
                onClick={() => setShowQuoted((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {showQuoted ? "Hide quoted text" : "Show quoted text"}
              </button>
            )}
          </div>
          {quoted && showQuoted && (
            <div className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {quoted}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

