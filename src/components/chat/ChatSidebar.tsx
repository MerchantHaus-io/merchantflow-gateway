import React, { useState } from "react";
import { Search, Hash, Bot, Sparkles, Plus, Trash2, X, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Channel, OnlineUser, ChatView, getAvatarColor, getInitials } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChatSidebarProps {
  channels: Channel[];
  onlineUsers: OnlineUser[];
  currentChannelId: string;
  currentDMUserId: string;
  view: ChatView;
  channelUnreadCounts: Record<string, number>;
  contactSearch: string;
  onContactSearchChange: (val: string) => void;
  onSelectChannel: (id: string) => void;
  onSelectContact: (id: string) => void;
  onSelectAI?: () => void;
  onChannelsChanged?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  channels,
  onlineUsers,
  currentChannelId,
  currentDMUserId,
  view,
  channelUnreadCounts,
  contactSearch,
  onContactSearchChange,
  onSelectChannel,
  onSelectContact,
  onSelectAI,
  onChannelsChanged,
}) => {
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  const filteredContacts = contactSearch
    ? onlineUsers.filter(u =>
        u.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(contactSearch.toLowerCase())
      )
    : onlineUsers;

  const filteredChannels = channels
    .filter(ch => !ch.name.toLowerCase().startsWith("dm-"))
    .filter(ch => !contactSearch || ch.name.toLowerCase().includes(contactSearch.toLowerCase()));

  const protectedChannels = ["general", "ops-updates", "atria-ai"];

  const handleCreateChannel = async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!name) return;
    if (channels.some(ch => ch.name.toLowerCase() === name)) {
      toast.error("Channel already exists");
      return;
    }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("chat_channels").insert({ name, created_by: user?.id || null });
    setCreating(false);
    if (error) {
      toast.error("Failed to create channel");
    } else {
      toast.success(`#${name} created`);
      setNewChannelName("");
      setShowNewChannel(false);
      onChannelsChanged?.();
    }
  };

  const handleDeleteChannel = async (e: React.MouseEvent, ch: Channel) => {
    e.stopPropagation();
    if (protectedChannels.includes(ch.name.toLowerCase())) {
      toast.error("Cannot delete system channel");
      return;
    }
    if (!confirm(`Delete #${ch.name}? All messages will be lost.`)) return;
    // Delete messages first, then channel
    await supabase.from("chat_messages").delete().eq("channel_id", ch.id);
    const { error } = await supabase.from("chat_channels").delete().eq("id", ch.id);
    if (error) {
      toast.error("Failed to delete channel");
    } else {
      toast.success(`#${ch.name} deleted`);
      onChannelsChanged?.();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[hsl(var(--wa-sidebar-bg))]">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--wa-meta))]" />
          <Input
            placeholder="Search or start new chat"
            value={contactSearch}
            onChange={(e) => onContactSearchChange(e.target.value)}
            className="h-9 pl-9 text-sm rounded-lg bg-[hsl(var(--wa-search-bg))] border-0 text-[hsl(var(--wa-bubble-in-foreground))] placeholder:text-[hsl(var(--wa-meta))] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div>
          {/* AI Assistant tab */}
          {onSelectAI && (
            <button
              onClick={onSelectAI}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-[hsl(var(--wa-divider))]",
                view === "ai"
                  ? "bg-[hsl(var(--wa-sidebar-hover))]"
                  : "hover:bg-[hsl(var(--wa-sidebar-hover))]"
              )}
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium text-sm text-[hsl(var(--wa-bubble-in-foreground))]">Atria AI</p>
                <p className="text-xs text-[hsl(var(--wa-meta))]">AI Assistant</p>
              </div>
            </button>
          )}

          {/* Channels */}
          {filteredChannels.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 py-2">
                <button
                  onClick={() => setChannelsOpen(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--wa-accent))] uppercase tracking-widest hover:text-[hsl(var(--wa-bubble-in-foreground))] transition-colors"
                >
                  {channelsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Channels
                </button>
                <button
                  onClick={() => setShowNewChannel(v => !v)}
                  className="text-[hsl(var(--wa-accent))] hover:text-[hsl(var(--wa-bubble-in-foreground))] transition-colors"
                  title="New channel"
                >
                  {showNewChannel ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              </div>

              {channelsOpen && (
                <>
                  {/* New channel input */}
                  {showNewChannel && (
                    <div className="px-4 pb-2 flex gap-2">
                      <Input
                        placeholder="channel-name"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                        className="h-8 text-xs rounded-md bg-[hsl(var(--wa-search-bg))] border-0 text-[hsl(var(--wa-bubble-in-foreground))] placeholder:text-[hsl(var(--wa-meta))] focus-visible:ring-0"
                        autoFocus
                        disabled={creating}
                      />
                      <button
                        onClick={handleCreateChannel}
                        disabled={creating || !newChannelName.trim()}
                        className="text-[hsl(var(--wa-accent))] hover:text-[hsl(var(--wa-bubble-in-foreground))] disabled:opacity-40 transition-colors shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {filteredChannels.map((ch) => {
                    const isActive = currentChannelId === ch.id && view === "chat";
                    const unread = channelUnreadCounts[ch.id] || 0;
                    const isProtected = protectedChannels.includes(ch.name.toLowerCase());
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onSelectChannel(ch.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-[hsl(var(--wa-divider))] group",
                          isActive
                            ? "bg-[hsl(var(--wa-sidebar-hover))]"
                            : "hover:bg-[hsl(var(--wa-sidebar-hover))]"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                          ch.name.toLowerCase() === "atria-ai"
                            ? "bg-purple-500"
                            : "bg-[hsl(var(--wa-accent))]"
                        )}>
                          {ch.name.toLowerCase() === "atria-ai" ? (
                            <Bot className="h-5 w-5 text-[hsl(var(--wa-header-foreground))]" />
                          ) : (
                            <Hash className="h-5 w-5 text-[hsl(var(--wa-header-foreground))]" />
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-medium text-sm text-[hsl(var(--wa-bubble-in-foreground))] truncate">
                            {ch.name}
                          </p>
                        </div>
                        {!isProtected && (
                          <button
                            onClick={(e) => handleDeleteChannel(e, ch)}
                            className="opacity-0 group-hover:opacity-100 text-[hsl(var(--wa-meta))] hover:text-red-400 transition-all shrink-0"
                            title={`Delete #${ch.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {unread > 0 && (
                          <span className="bg-[hsl(var(--wa-unread))] text-white text-[11px] font-medium min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* Contacts */}
          <button
            onClick={() => setDmsOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--wa-accent))] uppercase tracking-widest px-4 py-2 mt-1 hover:text-[hsl(var(--wa-bubble-in-foreground))] transition-colors w-full text-left"
          >
            {dmsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Direct Messages
          </button>
          {dmsOpen && (
            <>
              {filteredContacts.length === 0 ? (
                <p className="text-center text-[hsl(var(--wa-meta))] text-sm py-6">No contacts found</p>
              ) : (
                filteredContacts.map((u) => {
                  const isActive = currentDMUserId === u.id && view === "dm";
                  return (
                    <button
                      key={u.id}
                      onClick={() => onSelectContact(u.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-[hsl(var(--wa-divider))]",
                        isActive
                          ? "bg-[hsl(var(--wa-sidebar-hover))]"
                          : "hover:bg-[hsl(var(--wa-sidebar-hover))]"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.avatarUrl || undefined} />
                          <AvatarFallback className={cn(getAvatarColor(u.email || u.name), "text-white text-sm font-medium")}>
                            {getInitials(u.name, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[hsl(var(--wa-sidebar-bg))]",
                            u.isOnline ? "bg-[hsl(var(--wa-accent))]" : "bg-[hsl(var(--wa-meta))]"
                          )}
                        />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium text-sm text-[hsl(var(--wa-bubble-in-foreground))] truncate">
                          {u.name}
                        </p>
                        <p className="text-xs text-[hsl(var(--wa-meta))] truncate">
                          {u.isOnline
                            ? "online"
                            : u.lastSeen
                            ? `last seen ${formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}`
                            : "offline"}
                        </p>
                      </div>
                      {(u.unreadCount || 0) > 0 && (
                        <span className="bg-[hsl(var(--wa-unread))] text-white text-[11px] font-medium min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                          {(u.unreadCount || 0) > 99 ? "99+" : u.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
