import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
// Import the Textarea component to allow multi-line chat input. Using a textarea
// provides a better typing experience than a single-line input because users
// can create multi-line messages with Shift+Enter. The Textarea component
// already supports styling consistent with the rest of the UI.
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Reply, X, Users, Hash, ListTodo, Wifi, WifiOff, RefreshCw, Trash2, MoreVertical, Pencil, Archive, ArchiveRestore, Search, PanelLeftOpen, ArrowLeft, Clock } from "lucide-react";
import { TEAM_MEMBERS, EMAIL_TO_USER, TEAM_MEMBER_COLORS } from "@/types/opportunity";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTasks } from "@/contexts/TasksContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useConnectionStatus, useTypingIndicator, validateMessage } from "@/hooks/useChatUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUserRole } from "@/hooks/useUserRole";
import { AppLayout } from "@/components/AppLayout";

// Generate a consistent color based on a string (name/email)
const getAvatarColor = (str: string): string => {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 
    'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
    'bg-indigo-500', 'bg-pink-500', 'bg-lime-500', 'bg-fuchsia-500'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Format last seen time
const formatLastSeen = (lastSeen: string | null | undefined): string => {
  if (!lastSeen) return 'Never';
  
  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return lastSeenDate.toLocaleDateString();
};
type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  content: string;
  created_at: string;
  reply_to_id: string | null;
};

type Channel = {
  id: string;
  name: string;
  created_at: string;
  archived_at?: string | null;
  channel_type?: 'group' | 'direct';
  participant_name?: string;
};

type Profile = {
  id: string;
  avatar_url: string | null;
  full_name: string | null;
  email?: string | null;
  last_seen?: string | null;
};

type TypingUser = {
  id: string;
  name: string;
};

interface ChatBoxProps {
  messages: Message[];
  currentUserId: string;
  onSendMessage: (text: string, replyToId?: string) => void;
  profiles: Record<string, Profile>;
  typingUsers: TypingUser[];
  onTyping: () => void;
  searchQuery: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({ 
  messages, 
  currentUserId, 
  onSendMessage, 
  profiles, 
  typingUsers,
  onTyping,
  searchQuery
}) => {
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // Filter messages based on search query
  const filteredMessages = searchQuery.trim()
    ? messages.filter(msg => 
        msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  useEffect(() => {
    if (searchQuery.trim() && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, searchQuery]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed) {
      onSendMessage(trimmed, replyTo?.id);
      setInput("");
      setReplyTo(null);
    }
  };

  // Handle key presses on the chat input. When the user presses Enter without
  // holding Shift we send the message. If Shift+Enter is used we insert a
  // newline, letting the Textarea handle it naturally. Preventing the default
  // action on Enter stops newlines from being added unintentionally when
  // sending.
  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Update the input value and notify other clients that the user is typing.
  // The handler accepts both HTMLInputElement and HTMLTextAreaElement events
  // because the Textarea component uses a textarea under the hood.
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    onTyping();
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.split("@")[0].slice(0, 2).toUpperCase();
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  };

  const getDateKey = (timestamp: string) => {
    return new Date(timestamp).toDateString();
  };

  // Highlight matching text in search
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchQuery.toLowerCase() 
        ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">{part}</mark>
        : part
    );
  };

  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    return messages.find(m => m.id === replyToId);
  };

  const getDisplayName = (msg: Message) => {
    const profile = profiles[msg.user_id];
    return profile?.full_name || msg.user_name || msg.user_email.split("@")[0];
  };

  // Filter out current user from typing users
  const otherTypingUsers = typingUsers.filter(u => u.id !== currentUserId);

  // Group messages by date
  let lastDateKey = '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto space-y-3 border rounded-md p-4 mb-4 bg-background">
        {filteredMessages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            {searchQuery.trim() ? `No messages matching "${searchQuery}"` : 'No messages yet. Start the conversation!'}
          </p>
        ) : (
          filteredMessages.map((msg, index) => {
            const isOwn = msg.user_id === currentUserId;
            const profile = profiles[msg.user_id];
            const displayName = getDisplayName(msg);
            const avatarUrl = profile?.avatar_url;
            const replyMessage = getReplyMessage(msg.reply_to_id);
            const dateKey = getDateKey(msg.created_at);
            const showDateSeparator = dateKey !== lastDateKey;
            lastDateKey = dateKey;
            const isFirstMatch = searchQuery.trim() && index === 0;

            return (
              <React.Fragment key={msg.id}>
                {/* Date separator */}
                {showDateSeparator && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-medium px-2">
                      {formatFullDate(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div
                  ref={isFirstMatch ? highlightedRef : null}
                  className={cn(
                    "flex gap-2",
                    isOwn ? "justify-end" : "justify-start",
                    searchQuery.trim() && "bg-accent/30 rounded-lg p-1 -m-1"
                  )}
                >
                  {!isOwn && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                      <AvatarFallback className={cn(getAvatarColor(msg.user_email), "text-white text-xs")}> 
                        {getInitials(displayName, msg.user_email)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="max-w-xs">
                    {/* Reply preview */}
                    {replyMessage && (
                      <div className={`${isOwn ? "ml-auto" : ""} text-xs px-2 py-1 mb-1 rounded border-l-2 border-primary/50 bg-muted/50`}>
                        <span className="font-medium text-primary/70">{getDisplayName(replyMessage)}</span>
                        <p className="text-muted-foreground truncate">{replyMessage.content}</p>
                      </div>
                    )}
                    <div className={`${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"} p-3 rounded-lg group relative`}>
                      {!isOwn && (
                        <p className="text-xs font-semibold mb-1 opacity-80">{displayName}</p>
                      )}
                      <p className="text-sm">{highlightText(msg.content)}</p>
                      <p className={`${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"} text-xs mt-1`}>
                        {formatTime(msg.created_at)}
                      </p>
                      {/* Reply button */}
                      <button
                        onClick={() => setReplyTo(msg)}
                        className={`absolute top-1 ${isOwn ? "left-1" : "right-1"} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10`}
                        title="Reply"
                      >
                        <Reply className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {isOwn && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                      <AvatarFallback className={cn(getAvatarColor(msg.user_email), "text-white text-xs")}> 
                        {getInitials(displayName, msg.user_email)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {otherTypingUsers.length > 0 && (
        <div className="text-xs text-muted-foreground px-2 pb-2 flex items-center gap-1">
          <span className="flex gap-1">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
          </span>
          <span>
            {otherTypingUsers.length === 1 
              ? `${otherTypingUsers[0].name} is typing...`
              : `${otherTypingUsers.length} people are typing...`
            }
          </span>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-t-md border-l-2 border-primary">
          <Reply className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">{getDisplayName(replyTo)}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Message input and send button */}
      <div className="flex items-end gap-2">
        {/*
          Replace the single‑line Input with a Textarea to support multi‑line
          messages. We limit the height to a reasonable size and remove the
          ability to resize the box to keep the layout consistent. When
          Shift+Enter is pressed, a newline is inserted; Enter alone sends
          the message. The rounded‑t‑none class is retained when replying to
          ensure the reply preview sits flush on top of the input area.
        */}
        <Textarea
          placeholder={replyTo ? "Type your reply..." : "Type a message..."}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
          className={cn(
            "resize-none leading-tight min-h-[3rem] max-h-[10rem] overflow-y-auto",
            replyTo ? "rounded-t-none" : ""
          )}
        />
        <Button onClick={handleSend} className="h-10">Send</Button>
      </div>
    </div>
  );
};

// Helper to find a profile by participant name (matches full_name or email username)
const findProfileByName = (profiles: Record<string, Profile>, participantName: string): Profile | null => {
  const nameLower = participantName.toLowerCase();
  for (const profile of Object.values(profiles)) {
    // Check full_name
    if (profile.full_name?.toLowerCase() === nameLower) {
      return profile;
    }
    // Check email username part
    if (profile.email) {
      const emailUsername = profile.email.split('@')[0].toLowerCase();
      if (emailUsername === nameLower || profile.email.toLowerCase().startsWith(nameLower)) {
        return profile;
      }
    }
  }
  return null;
};

interface ChannelListProps {
  channels: Channel[];
  current: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onCreateDM: (memberName: string) => void;
  onDeleteChannel: (id: string, name: string) => void;
  onRenameChannel: (id: string, newName: string) => void;
  onArchiveChannel: (id: string, name: string) => void;
  onRestoreChannel: (id: string, name: string) => void;
  currentUserName: string;
  unreadByChannel: Record<string, number>;
  isAdmin: boolean;
  showArchived: boolean;
  onToggleShowArchived: () => void;
  profiles: Record<string, Profile>;
  onlineUsers: Set<string>;
}

const ChannelList: React.FC<ChannelListProps> = ({ 
  channels, current, onSelect, onCreate, onCreateDM, onDeleteChannel, onRenameChannel, onArchiveChannel, onRestoreChannel, currentUserName, unreadByChannel, isAdmin, showArchived, onToggleShowArchived, profiles, onlineUsers 
}) => {
  const [newChannel, setNewChannel] = useState("");
  const [renamingChannel, setRenamingChannel] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = () => {
    const trimmed = newChannel.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewChannel("");
    }
  };

  const handleRenameSubmit = () => {
    if (renamingChannel && renameValue.trim() && renameValue.trim() !== renamingChannel.name) {
      onRenameChannel(renamingChannel.id, renameValue.trim());
    }
    setRenamingChannel(null);
    setRenameValue("");
  };

  // Separate group channels and direct messages, filtering by archived status
  const allGroupChannels = channels.filter(ch => ch.channel_type !== 'direct');
  const groupChannels = showArchived 
    ? allGroupChannels 
    : allGroupChannels.filter(ch => !ch.archived_at);
  
  // Deduplicate direct channels by participant name (keep most recent)
  const directChannelsRaw = channels.filter(ch => ch.channel_type === 'direct');
  const seenParticipants = new Map<string, Channel>();
  directChannelsRaw.forEach(ch => {
    const participantKey = ch.participant_name?.toLowerCase() || '';
    const existing = seenParticipants.get(participantKey);
    // Keep the most recent channel (by created_at) for each participant
    if (!existing || new Date(ch.created_at) > new Date(existing.created_at)) {
      seenParticipants.set(participantKey, ch);
    }
  });
  const directChannels = Array.from(seenParticipants.values());
  
  // Get team members who don't have a DM channel yet
  const existingDMNames = directChannels.map(ch => ch.participant_name?.toLowerCase());
  const availableForDM = TEAM_MEMBERS.filter(member =>
    member.toLowerCase() !== currentUserName.toLowerCase() &&
    !existingDMNames.includes(member.toLowerCase())
  );
  
  const archivedCount = allGroupChannels.filter(ch => ch.archived_at).length;
  
  return (
    <div className="space-y-4">
      {/* Group Channels */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold mb-2">
          <div className="flex items-center gap-2">
            <Hash className="h-3 w-3" />
            Channels
          </div>
          {isAdmin && archivedCount > 0 && (
            <button
              onClick={onToggleShowArchived}
              className="flex items-center gap-1 hover:text-foreground transition-colors normal-case font-normal"
            >
              <Archive className="h-3 w-3" />
              {showArchived ? 'Hide archived' : `${archivedCount} archived`}
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {groupChannels.map((ch) => (
            <li key={ch.id} className="group">
              <div
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between",
                  current === ch.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
                  ch.archived_at && "opacity-60"
                )}
              >
                {renamingChannel?.id === ch.id ? (
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(); }}
                    className="flex-1 flex items-center gap-1"
                  >
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setRenamingChannel(null); setRenameValue(""); }}}
                      className="h-6 text-sm py-0 px-1"
                      autoFocus
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(ch.id)}
                    className="flex-1 flex items-center gap-1 text-left"
                  >
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    {ch.name}
                    {ch.archived_at && <Archive className="h-3 w-3 ml-1 text-muted-foreground" />}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  {unreadByChannel[ch.id] && unreadByChannel[ch.id] > 0 && (
                    <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                      {unreadByChannel[ch.id] > 99 ? '99+' : unreadByChannel[ch.id]}
                    </span>
                  )}
                  {isAdmin && ch.name !== 'general' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-opacity">
                          <MoreVertical className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        {!ch.archived_at && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingChannel({ id: ch.id, name: ch.name });
                                setRenameValue(ch.name);
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onArchiveChannel(ch.id, ch.name);
                              }}
                            >
                              <Archive className="h-3 w-3 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </>
                        )}
                        {ch.archived_at && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestoreChannel(ch.id, ch.name);
                            }}
                          >
                            <ArchiveRestore className="h-3 w-3 mr-2" />
                            Restore
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChannel(ch.id, ch.name);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-2">
          <Input
            type="text"
            placeholder="New channel"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            className="h-8 text-sm"
          />
          <Button onClick={handleCreate} size="sm" className="h-8">Create</Button>
        </div>
      </div>

      {/* Direct Messages */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
          <Users className="h-3 w-3" />
          Direct Messages
        </div>
        <ul className="space-y-1">
          {directChannels.map((ch) => {
            const participantProfile = ch.participant_name ? findProfileByName(profiles, ch.participant_name) : null;
            const isOnline = participantProfile ? onlineUsers.has(participantProfile.id) : false;
            const lastSeenText = !isOnline && participantProfile?.last_seen ? formatLastSeen(participantProfile.last_seen) : null;
            return (
              <li key={ch.id}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelect(ch.id)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between",
                          current === ch.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <div className="relative">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={participantProfile?.avatar_url || undefined} alt={ch.participant_name} />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {ch.participant_name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                              isOnline ? "bg-emerald-500" : "bg-gray-400"
                            )} />
                          </div>
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 text-sm">
                              {ch.participant_name}
                            </span>
                            {!isOnline && lastSeenText && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {lastSeenText}
                              </span>
                            )}
                          </div>
                        </span>
                        {unreadByChannel[ch.id] && unreadByChannel[ch.id] > 0 && (
                          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                            {unreadByChannel[ch.id] > 99 ? '99+' : unreadByChannel[ch.id]}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isOnline ? 'Online now' : lastSeenText ? `Last seen: ${lastSeenText}` : 'Offline'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </li>
            );
          })}
        </ul>

        {/* Add new DM */}
        {availableForDM.length > 0 && (
          <div className="mt-2">
            <select
              className="w-full h-8 text-sm rounded-md border bg-background px-2"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onCreateDM(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="" disabled>Start new chat...</option>
              {availableForDM.map(member => (
                <option key={member} value={member}>{member}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

const Chat: React.FC = () => {
  const { user, teamMemberName, loading } = useAuth();
  const { isAdmin } = useUserRole();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [mobileChannelListOpen, setMobileChannelListOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalPresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const userName = teamMemberName || user?.email?.split("@")[0] || "";
  const { tasks } = useTasks();
  const { unreadByChannel, markChannelAsRead } = useUnreadMessages();

  // Connection status and typing utilities
  const { isConnected, isReconnecting } = useConnectionStatus();
  const { startTyping, stopTyping } = useTypingIndicator(presenceChannelRef, userName);

  // Get user's tasks
  const myTasks = tasks.filter(t => t.assignee?.toLowerCase() === userName.toLowerCase() && t.status !== 'done');

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_channels")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load channels");
      return;
    }

    // Process channels to determine type and participant
    const processedChannels = (data || []).map(ch => {
      // Check if it's a DM channel (contains "dm-" prefix or has participant info)
      if (ch.name?.startsWith('dm-')) {
        const participants = ch.name.replace('dm-', '').split('-');
        const otherParticipant = participants.find((p: string) =>
          p.toLowerCase() !== userName.toLowerCase()
        );
        return {
          ...ch,
          channel_type: 'direct' as const,
          participant_name: otherParticipant || participants[0]
        };
      }
      return { ...ch, channel_type: 'group' as const };
    });

    setChannels(processedChannels);
    if (processedChannels && processedChannels.length > 0 && !currentChannelId) {
      setCurrentChannelId(processedChannels[0].id);
    }
  }, [currentChannelId, userName]);

  // Fetch messages for current channel
  const fetchMessages = useCallback(async () => {
    if (!currentChannelId) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_id", currentChannelId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load messages");
      return;
    }

    setMessages(data || []);

    // Fetch profiles for any missing user_ids
    const userIds = [...new Set((data || []).map(m => m.user_id))];
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, avatar_url, full_name, email, last_seen")
        .in("id", userIds);

      if (profilesData) {
        const profileMap: Record<string, Profile> = {};
        profilesData.forEach(p => {
          profileMap[p.id] = p;
        });
        setProfiles(prev => ({ ...prev, ...profileMap }));
      }
    }
  }, [currentChannelId]);

  // Fetch all profiles upfront
  const fetchAllProfiles = useCallback(async () => {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, avatar_url, full_name, email, last_seen");

    if (profilesData) {
      const profileMap: Record<string, Profile> = {};
      profilesData.forEach(p => {
        profileMap[p.id] = p;
      });
      setProfiles(profileMap);
    }
  }, []);

  // Update current user's last_seen
  const updateLastSeen = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", user.id);
  }, [user]);

  // Initial data load
  useEffect(() => {
    if (user) {
      Promise.all([fetchChannels(), fetchAllProfiles()])
        .finally(() => setLoadingData(false));
      
      // Update last_seen on load and periodically
      updateLastSeen();
      const interval = setInterval(updateLastSeen, 60000); // Every minute
      return () => clearInterval(interval);
    }
  }, [user, fetchChannels, fetchAllProfiles, updateLastSeen]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (currentChannelId) {
      fetchMessages();
    }
  }, [currentChannelId, fetchMessages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!currentChannelId) return;

    const channel = supabase
      .channel(`chat-messages-${currentChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${currentChannelId}`
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          // Fetch profile if not already cached
          if (!profiles[newMsg.user_id]) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("id, avatar_url, full_name, last_seen")
              .eq("id", newMsg.user_id)
              .single();

            if (profileData) {
              setProfiles(prev => ({ ...prev, [profileData.id]: profileData }));
            }
          }

          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentChannelId, profiles]);

  // Subscribe to new channels
  useEffect(() => {
    const channel = supabase
      .channel('chat-channels')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_channels'
        },
        (payload) => {
          setChannels(prev => [...prev, payload.new as Channel]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Setup presence for typing indicators
  useEffect(() => {
    if (!currentChannelId || !user) return;

    const presenceChannel = supabase.channel(`typing-${currentChannelId}`, {
      config: { presence: { key: user.id } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const typing: TypingUser[] = [];
        
        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0] as { typing?: boolean; name?: string };
          if (presence?.typing) {
            typing.push({ id: userId, name: presence.name || 'Someone' });
          }
        });
        
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ typing: false, name: userName });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [currentChannelId, user, userName]);

  // Global presence tracking for online/offline status
  useEffect(() => {
    if (!user) return;

    const globalChannel = supabase.channel("global-chat-presence", {
      config: { presence: { key: user.id } }
    });

    globalChannel
      .on("presence", { event: "sync" }, () => {
        const state = globalChannel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await globalChannel.track({
            name: userName,
            email: user.email,
            online_at: new Date().toISOString()
          });
        }
      });

    globalPresenceRef.current = globalChannel;

    return () => {
      supabase.removeChannel(globalChannel);
      globalPresenceRef.current = null;
    };
  }, [user, userName]);

  // Use the improved typing indicator
  const handleTyping = useCallback(() => {
    startTyping();
  }, [startTyping]);

  const handleSelectChannel = (id: string) => {
    setCurrentChannelId(id);
    setMessages([]);
    setTypingUsers([]);
    // Mark channel as read when selected
    markChannelAsRead(id);
  };

  const handleCreateChannel = async (name: string) => {
    const exists = channels.some(ch => ch.name.toLowerCase() === name.toLowerCase() && ch.channel_type === 'group');
    if (exists) {
      toast.error("Channel already exists");
      return;
    }

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({ name, created_by: user?.id })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create channel");
    } else if (data) {
      setChannels(prev => [...prev, { ...data, channel_type: 'group' }]);
      setCurrentChannelId(data.id);
    }
  };

  // Create a DM channel with another team member
  const handleCreateDM = async (memberName: string) => {
    // Create a consistent DM channel name (sorted alphabetically)
    const participants = [userName, memberName].sort();
    const dmChannelName = `dm-${participants.join('-')}`;

    // Check if channel already exists
    const existingChannel = channels.find(ch => ch.name === dmChannelName);
    if (existingChannel) {
      setCurrentChannelId(existingChannel.id);
      return;
    }

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({ name: dmChannelName, created_by: user?.id })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create direct message");
    } else if (data) {
      const newChannel: Channel = {
        ...data,
        channel_type: 'direct',
        participant_name: memberName
      };
      setChannels(prev => [...prev, newChannel]);
      setCurrentChannelId(data.id);
    }
  };

  // Delete a channel (admin only)
  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    if (!confirm(`Are you sure you want to permanently delete the channel "${channelName}"? This will delete all messages in this channel.`)) {
      return;
    }

    const { error } = await supabase
      .from("chat_channels")
      .delete()
      .eq("id", channelId);

    if (error) {
      console.error("Failed to delete channel:", error);
      toast.error("Failed to delete channel");
      return;
    }

    toast.success(`Channel "${channelName}" deleted`);
    setChannels(prev => prev.filter(ch => ch.id !== channelId));
    
    // If we deleted the current channel, switch to another
    if (currentChannelId === channelId) {
      const remainingChannels = channels.filter(ch => ch.id !== channelId);
      if (remainingChannels.length > 0) {
        setCurrentChannelId(remainingChannels[0].id);
      } else {
        setCurrentChannelId("");
      }
    }
  };

  // Rename a channel (admin only)
  const handleRenameChannel = async (channelId: string, newName: string) => {
    const exists = channels.some(ch => ch.id !== channelId && ch.name.toLowerCase() === newName.toLowerCase() && ch.channel_type === 'group');
    if (exists) {
      toast.error("A channel with that name already exists");
      return;
    }

    const { error } = await supabase
      .from("chat_channels")
      .update({ name: newName })
      .eq("id", channelId);

    if (error) {
      console.error("Failed to rename channel:", error);
      toast.error("Failed to rename channel");
      return;
    }

    toast.success(`Channel renamed to "${newName}"`);
    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, name: newName } : ch));
  };

  // Archive a channel (admin only)
  const handleArchiveChannel = async (channelId: string, channelName: string) => {
    const { error } = await supabase
      .from("chat_channels")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", channelId);

    if (error) {
      console.error("Failed to archive channel:", error);
      toast.error("Failed to archive channel");
      return;
    }

    toast.success(`Channel "${channelName}" archived`);
    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, archived_at: new Date().toISOString() } : ch));
  };

  // Restore an archived channel (admin only)
  const handleRestoreChannel = async (channelId: string, channelName: string) => {
    const { error } = await supabase
      .from("chat_channels")
      .update({ archived_at: null })
      .eq("id", channelId);

    if (error) {
      console.error("Failed to restore channel:", error);
      toast.error("Failed to restore channel");
      return;
    }

    toast.success(`Channel "${channelName}" restored`);
    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, archived_at: null } : ch));
  };

  // Toggle show archived channels
  const [showArchived, setShowArchived] = useState(false);
  
  // Message search
  const [messageSearch, setMessageSearch] = useState("");

  const handleSendMessage = async (text: string, replyToId?: string) => {
    // Validate message
    const validation = validateMessage(text);
    if (!validation.valid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    if (!user || !currentChannelId) return;

    // Stop typing indicator when sending
    stopTyping();

    // Optimistic update
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      channel_id: currentChannelId,
      user_id: user.id,
      user_email: user.email || "",
      user_name: userName,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyToId || null
    };

    setMessages(prev => [...prev, optimisticMessage]);

    const { error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: currentChannelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: userName,
        content: text,
        reply_to_id: replyToId || null
      });

    if (error) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error("Failed to send message. Please try again.");
    }
  };

  const currentChannel = channels.find(ch => ch.id === currentChannelId);

  // Get channel display name
  const getChannelDisplayName = () => {
    if (!currentChannel) return "Select a channel";
    if (currentChannel.channel_type === 'direct') {
      return currentChannel.participant_name || "Direct Message";
    }
    return currentChannel.name;
  };

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || loadingData) {
    return (
      <AppLayout>
        <div className="p-4 flex items-center justify-center h-[70vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full p-2 sm:p-4 gap-2 sm:gap-4">
        {/* Desktop header - hidden on mobile */}
        <div className="hidden sm:flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold">Team Chat</h1>
            <span className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{userName}</span>
            </span>
            {/* Connection status indicator */}
            {!isConnected && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                      isReconnecting 
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" 
                        : "bg-red-500/20 text-red-600 dark:text-red-400"
                    )}>
                      {isReconnecting ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Reconnecting
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" />
                          Offline
                        </>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isReconnecting 
                      ? "Attempting to reconnect to the server..." 
                      : "Connection lost. Messages may not be delivered."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Tasks Modal Button */}
            <Dialog open={tasksModalOpen} onOpenChange={setTasksModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="relative">
                  <ListTodo className="h-4 w-4 mr-2" />
                  My Tasks
                  {myTasks.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                      {myTasks.length > 9 ? '9+' : myTasks.length}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    My Tasks ({myTasks.length})
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto max-h-[60vh] space-y-2 mt-4">
                  {myTasks.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No pending tasks</p>
                  ) : (
                    myTasks.map(task => (
                      <div
                        key={task.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant={task.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                                {task.status === 'open' ? 'Open' : 'In Progress'}
                              </Badge>
                              {task.accountName && (
                                <span className="text-xs text-muted-foreground">
                                  {task.accountName}
                                </span>
                              )}
                              {task.dueAt && (
                                <span className="text-xs text-muted-foreground">
                                  Due: {new Date(task.dueAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/my-tasks" onClick={() => setTasksModalOpen(false)}>
                      View All Tasks
                    </Link>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 relative">
          {/* Mobile channel list overlay */}
          <div 
            className={cn(
              "lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity",
              mobileChannelListOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setMobileChannelListOpen(false)}
          />
          
          {/* Channel sidebar - slide out on mobile */}
          <aside 
            className={cn(
              "absolute lg:relative z-50 lg:z-auto h-full w-[280px] lg:w-1/4 border rounded-md p-4 bg-background overflow-y-auto transition-transform duration-200 lg:translate-x-0 shrink-0",
              mobileChannelListOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
            )}
          >
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <span className="text-sm font-medium">Channels</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setMobileChannelListOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ChannelList
              channels={channels}
              current={currentChannelId}
              onSelect={(id) => {
                handleSelectChannel(id);
                setMobileChannelListOpen(false);
              }}
              onCreate={handleCreateChannel}
              onCreateDM={handleCreateDM}
              onDeleteChannel={handleDeleteChannel}
              onRenameChannel={handleRenameChannel}
              onArchiveChannel={handleArchiveChannel}
              onRestoreChannel={handleRestoreChannel}
              currentUserName={userName}
              unreadByChannel={unreadByChannel}
              isAdmin={isAdmin}
              showArchived={showArchived}
              onToggleShowArchived={() => setShowArchived(prev => !prev)}
              profiles={profiles}
              onlineUsers={onlineUsers}
            />
          </aside>
          
          {/* Main chat area */}
          <div className="flex-grow border rounded-md p-2 sm:p-4 bg-background flex flex-col min-h-0 lg:ml-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                {/* Mobile channel toggle button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 lg:hidden shrink-0"
                  onClick={() => setMobileChannelListOpen(true)}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
                {currentChannel?.channel_type === 'direct' ? (
                  (() => {
                    const headerProfile = currentChannel.participant_name ? findProfileByName(profiles, currentChannel.participant_name) : null;
                    const isParticipantOnline = headerProfile ? onlineUsers.has(headerProfile.id) : false;
                    return (
                      <>
                        <div className="relative">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={headerProfile?.avatar_url || undefined} alt={currentChannel.participant_name} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {currentChannel.participant_name?.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {isParticipantOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <h2 className="font-semibold text-sm sm:text-base truncate leading-tight">{currentChannel.participant_name}</h2>
                          <span className={cn(
                            "text-[10px] leading-tight",
                            isParticipantOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                          )}>
                            {isParticipantOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                    <h2 className="font-semibold text-sm sm:text-base truncate">{getChannelDisplayName()}</h2>
                  </>
                )}
              </div>
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="h-8 w-28 sm:w-48 pl-8 text-sm"
                />
                {messageSearch && (
                  <button
                    onClick={() => setMessageSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <ChatBox
              messages={messages}
              currentUserId={user?.id || ""}
              onSendMessage={handleSendMessage}
              profiles={profiles}
              typingUsers={typingUsers}
              onTyping={handleTyping}
              searchQuery={messageSearch}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Chat;