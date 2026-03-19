import React, { useCallback, useRef } from "react";
import { Bot } from "lucide-react";
import {
  Check, CheckCheck, Reply, Edit2, Smile, File, Download, Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  ChannelMessage, DirectMessage, Profile, Reaction,
  COMMON_EMOJIS, getAvatarColor, getInitials, formatFileSize,
} from "./types";

interface ChatBubbleProps {
  msg: ChannelMessage | DirectMessage;
  isChannel: boolean;
  isOwn: boolean;
  profile: Profile | undefined;
  displayName: string;
  email: string;
  replyMessage: (ChannelMessage | DirectMessage) | null;
  replySourceName: string | null;
  reactions: Reaction[];
  userId: string;
  editingMessageId: string | null;
  editContent: string;
  signedUrls: Record<string, string>;
  onSetReplyTo: (msg: ChannelMessage | DirectMessage) => void;
  onSetEditingMessage: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onEditContent: (val: string) => void;
  onSubmitEdit: (id: string, isChannel: boolean) => void;
  onReaction: (messageId: string, emoji: string, type: 'channel' | 'direct') => void;
  onDeleteMessage: (messageId: string, isChannel: boolean) => void;
  onProfileClick: (userId: string) => void;
  onResolveAttachment: (msgId: string, url: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  msg, isChannel, isOwn, profile, displayName, email,
  replyMessage, replySourceName, reactions: msgReactions, userId,
  editingMessageId, editContent, signedUrls,
  onSetReplyTo, onSetEditingMessage, onCancelEdit, onEditContent, onSubmitEdit,
  onReaction, onDeleteMessage, onProfileClick, onResolveAttachment,
}) => {
  const senderId = isChannel ? (msg as ChannelMessage).user_id : (msg as DirectMessage).sender_id;
  const senderEmail = isChannel ? (msg as ChannelMessage).user_email : "";
  const isAIBot = senderEmail === "ai-assistant@ops.internal";
  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Swipe-to-reply
  const swipeRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeRef.current.startX;
    const deltaY = Math.abs(touch.clientY - swipeRef.current.startY);
    if (deltaY > 30 && !swipeRef.current.swiping) { swipeRef.current = null; return; }
    if (deltaX > 10) {
      swipeRef.current.swiping = true;
      const el = e.currentTarget as HTMLElement;
      el.style.transform = `translateX(${Math.min(deltaX * 0.5, 60)}px)`;
      el.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeRef.current.startX;
    el.style.transform = '';
    el.style.transition = 'transform 0.2s ease-out';
    if (swipeRef.current.swiping && deltaX > 50) onSetReplyTo(msg);
    swipeRef.current = null;
  }, [msg, onSetReplyTo]);

  // Render attachment
  const renderAttachment = () => {
    const storedUrl = msg.attachment_url;
    if (!storedUrl) return null;
    if (!signedUrls[msg.id] && !storedUrl.startsWith('http')) {
      onResolveAttachment(msg.id, storedUrl);
    }
    const attachmentUrl = signedUrls[msg.id] || (storedUrl.startsWith('http') ? storedUrl : '');
    const isImage = msg.attachment_type?.startsWith('image/');
    const isAudio = msg.attachment_type?.startsWith('audio/');

    if (!attachmentUrl) {
      return (
        <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-white/10 text-xs opacity-60">
          <File className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="truncate flex-1">{msg.attachment_name || 'Loading...'}</span>
        </div>
      );
    }
    if (isImage) {
      return (
        <div className="mt-2 rounded-lg overflow-hidden max-w-[240px]">
          <img src={attachmentUrl} alt={msg.attachment_name || 'Image'} className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(attachmentUrl, '_blank')} />
        </div>
      );
    }
    if (isAudio) {
      return (
        <div className="mt-2">
          <audio controls className="max-w-full h-8" preload="metadata">
            <source src={attachmentUrl} type={msg.attachment_type || 'audio/webm'} />
          </audio>
        </div>
      );
    }
    return (
      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs">
        <File className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{msg.attachment_name || 'File'}</span>
        {msg.attachment_size && <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(msg.attachment_size)}</span>}
        <Download className="h-3 w-3 shrink-0" />
      </a>
    );
  };

  // Render reactions
  const renderReactions = () => {
    if (msgReactions.length === 0) return null;
    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    msgReactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_email);
      if (r.user_id === userId) grouped[r.emoji].hasOwn = true;
    });
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {Object.entries(grouped).map(([emoji, data]) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button onClick={() => onReaction(msg.id, emoji, isChannel ? 'channel' : 'direct')}
                className={cn("text-xs px-1.5 py-0.5 rounded-full border transition-all",
                  data.hasOwn ? "bg-[hsl(var(--wa-accent)/0.2)] border-[hsl(var(--wa-accent)/0.4)]" : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >{emoji} {data.count}</button>
            </TooltipTrigger>
            <TooltipContent>{data.users.join(', ')}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  };

  // Read receipt
  const renderReadReceipt = () => {
    if (isChannel) return null;
    const dm = msg as DirectMessage;
    if (dm.sender_id !== userId) return null;
    if (dm.read_at) {
      return (
        <Tooltip>
          <TooltipTrigger asChild><CheckCheck className="h-3 w-3 text-[hsl(var(--wa-accent))] inline-block ml-1" /></TooltipTrigger>
          <TooltipContent>Read {formatDistanceToNow(new Date(dm.read_at), { addSuffix: true })}</TooltipContent>
        </Tooltip>
      );
    }
    return <CheckCheck className="h-3 w-3 text-[hsl(var(--wa-meta))] inline-block ml-1" />;
  };

  return (
    <div className={cn("flex gap-2 min-w-0 overflow-hidden px-[6%] md:px-[10%]", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        isAIBot ? (
          <div className="shrink-0 self-end mb-1">
            <div className="h-7 w-7 rounded-full bg-purple-500 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => onProfileClick(senderId)} className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity self-end mb-1">
            <Avatar className="h-7 w-7">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className={cn(getAvatarColor(email || displayName), "text-white text-[10px]")}>
                {getInitials(displayName, email)}
              </AvatarFallback>
            </Avatar>
          </button>
        )
      )}
      <div
        className="max-w-[75%] min-w-0 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Reply context */}
        {replyMessage && (
          <button
            type="button"
            className={cn(
              "text-xs px-3 py-1.5 mb-0.5 rounded-t-lg w-full text-left cursor-pointer transition-colors border-l-3",
              isOwn
                ? "bg-[hsl(var(--wa-bubble-out)/0.7)] border-[hsl(var(--wa-accent))]"
                : "bg-[hsl(var(--wa-bubble-in)/0.7)] border-[hsl(var(--wa-accent))]"
            )}
            onClick={() => {
              const replyEl = document.getElementById(`msg-${replyMessage.id}`);
              if (replyEl) {
                replyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                replyEl.classList.add('ring-2', 'ring-[hsl(var(--wa-accent))]');
                setTimeout(() => replyEl.classList.remove('ring-2', 'ring-[hsl(var(--wa-accent))]'), 2000);
              }
            }}
          >
            <span className="font-medium text-[hsl(var(--wa-accent))]">{replySourceName}</span>
            <p className="text-[hsl(var(--wa-meta))] truncate">{replyMessage.content}</p>
          </button>
        )}

        {/* Bubble */}
        <div
          id={`msg-${msg.id}`}
          className={cn(
            "relative group px-3 py-1.5 break-words overflow-hidden transition-all duration-300",
            isOwn
              ? "bg-[hsl(var(--wa-bubble-out))] text-[hsl(var(--wa-bubble-out-foreground))] rounded-lg rounded-tr-none"
              : "bg-[hsl(var(--wa-bubble-in))] text-[hsl(var(--wa-bubble-in-foreground))] rounded-lg rounded-tl-none",
            replyMessage ? "rounded-t-none" : ""
          )}
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          onDoubleClick={() => onSetReplyTo(msg)}
        >
          {/* Bubble tail */}
          <div className={cn(
            "absolute top-0 w-3 h-3",
            isOwn ? "-right-1.5" : "-left-1.5",
            replyMessage && "hidden"
          )}>
            <svg viewBox="0 0 12 12" className={cn("w-3 h-3", isOwn ? "text-[hsl(var(--wa-bubble-out))]" : "text-[hsl(var(--wa-bubble-in))]")}>
              {isOwn ? (
                <path d="M0 0 L12 0 L0 12 Z" fill="currentColor" />
              ) : (
                <path d="M12 0 L0 0 L12 12 Z" fill="currentColor" />
              )}
            </svg>
          </div>

          {!isOwn && isChannel && (
            <button type="button" onClick={() => onProfileClick(senderId)} className="text-xs font-semibold mb-0.5 text-[hsl(var(--wa-accent))] hover:underline cursor-pointer block">
              {displayName}
            </button>
          )}

          {editingMessageId === msg.id ? (
            <div className="space-y-2">
              <Input value={editContent} onChange={(e) => onEditContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSubmitEdit(msg.id, isChannel); if (e.key === "Escape") onCancelEdit(); }}
                className="h-7 text-sm" autoFocus
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs" onClick={() => onSubmitEdit(msg.id, isChannel)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancelEdit}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
          )}

          {renderAttachment()}

          <div className="flex items-center gap-1 mt-0.5 justify-end">
            <span className="text-[10px] text-[hsl(var(--wa-meta))]">{formatTime(msg.created_at)}</span>
            {msg.edited_at && <span className="text-[10px] text-[hsl(var(--wa-meta))]">edited</span>}
            {renderReadReceipt()}
          </div>

          {renderReactions()}

          {/* Hover actions */}
          <div className={cn(
            "absolute top-1 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5",
            "bg-[hsl(var(--wa-sidebar-bg))] border border-[hsl(var(--wa-divider))] rounded-lg shadow-lg p-0.5",
            isOwn ? "left-1" : "right-1"
          )}>
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-1 hover:bg-white/10 rounded-md transition-colors" title="React">
                  <Smile className="h-3.5 w-3.5 text-[hsl(var(--wa-meta))]" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="end">
                <div className="flex gap-1">
                  {COMMON_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => onReaction(msg.id, emoji, isChannel ? 'channel' : 'direct')} className="text-lg hover:scale-125 transition-transform p-1">{emoji}</button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={() => onSetReplyTo(msg)} className="p-1 hover:bg-white/10 rounded-md transition-colors" title="Reply">
              <Reply className="h-3.5 w-3.5 text-[hsl(var(--wa-meta))]" />
            </button>
            {isOwn && (
              <>
                <button onClick={() => onSetEditingMessage(msg.id, msg.content)}
                  className="p-1 hover:bg-white/10 rounded-md transition-colors" title="Edit">
                  <Edit2 className="h-3.5 w-3.5 text-[hsl(var(--wa-meta))]" />
                </button>
                <button onClick={() => onDeleteMessage(msg.id, isChannel)}
                  className="p-1 hover:bg-red-500/20 rounded-md transition-colors" title="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--wa-meta))] hover:text-red-400" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
