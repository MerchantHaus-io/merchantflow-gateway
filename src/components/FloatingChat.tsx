import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Users, Hash, Reply, ChevronLeft, Plus, Check, CheckCheck, Smile, Search, Edit2, MoreVertical, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useChatNotifications } from "@/hooks/useChatNotifications";

type DirectMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  edited_at?: string | null;
};

type ChannelMessage = {
  id: string;
  channel_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  content: string;
  created_at: string;
  reply_to_id: string | null;
  edited_at?: string | null;
};

type Channel = {
  id: string;
  name: string;
  created_at: string;
};

type Profile = {
  id: string;
  avatar_url: string | null;
  full_name: string | null;
  email: string | null;
  last_seen?: string | null;
};

type OnlineUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  unreadCount?: number;
  lastSeen?: string | null;
};

type TypingUser = {
  id: string;
  name: string;
};

type Reaction = {
  id: string;
  message_id: string;
  message_type: 'channel' | 'direct';
  user_id: string;
  user_email: string;
  emoji: string;
};

type ChatView = "contacts" | "channels" | "chat" | "dm";

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

const FloatingChat: React.FC = () => {
  const { user, teamMemberName } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ChatView>("contacts");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string>("");
  const [currentDMUserId, setCurrentDMUserId] = useState<string>("");
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<DirectMessage | ChannelMessage | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalPresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dmChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSeenIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const userName = teamMemberName || user?.email?.split("@")[0] || "";

  // Chat notifications hook
  const { requestPermission, isSupported, permissionStatus } = useChatNotifications({
    isChatOpen: isOpen,
    currentChannelId,
    currentDMUserId,
  });
  useEffect(() => {
    if (!user) return;

    const updateLastSeen = async () => {
      await supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", user.id);
    };

    updateLastSeen();
    lastSeenIntervalRef.current = setInterval(updateLastSeen, 30000);

    return () => {
      if (lastSeenIntervalRef.current) clearInterval(lastSeenIntervalRef.current);
    };
  }, [user]);

  // Fetch all registered users for contacts
  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url, full_name, email, last_seen");

    if (error) {
      console.error("Failed to load profiles:", error);
      return;
    }

    const profileMap: Record<string, Profile> = {};
    (data || []).forEach(p => {
      profileMap[p.id] = p;
    });
    setProfiles(profileMap);

    // Initialize online users with all profiles
    const now = new Date();
    const users: OnlineUser[] = (data || [])
      .filter(p => p.id !== user?.id)
      .map(p => {
        const lastSeen = p.last_seen ? new Date(p.last_seen) : null;
        const isOnline = lastSeen ? (now.getTime() - lastSeen.getTime()) < 120000 : false;
        return {
          id: p.id,
          name: p.full_name || p.email?.split("@")[0] || "User",
          email: p.email || "",
          avatarUrl: p.avatar_url,
          isOnline,
          unreadCount: 0,
          lastSeen: p.last_seen
        };
      });
    setOnlineUsers(users);
  }, [user?.id]);

  // Fetch unread DM counts for each user
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("Failed to fetch unread counts:", error);
      return;
    }

    const counts: Record<string, number> = {};
    (data || []).forEach(msg => {
      counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
    });

    setOnlineUsers(prev => prev.map(u => ({
      ...u,
      unreadCount: counts[u.id] || 0
    })));

    setUnreadCount((data || []).length);
  }, [user]);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_channels")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load channels:", error);
      return;
    }

    setChannels(data || []);
  }, []);

  // Fetch channel messages
  const fetchChannelMessages = useCallback(async () => {
    if (!currentChannelId) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_id", currentChannelId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load messages:", error);
      return;
    }

    setChannelMessages(data || []);
    fetchReactions((data || []).map(m => m.id), 'channel');
  }, [currentChannelId]);

  // Fetch direct messages for a conversation
  const fetchDirectMessages = useCallback(async () => {
    if (!currentDMUserId || !user) return;

    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${currentDMUserId}),and(sender_id.eq.${currentDMUserId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load direct messages:", error);
      return;
    }

    setDirectMessages(data || []);
    fetchReactions((data || []).map(m => m.id), 'direct');

    // Mark received messages as read
    const unreadIds = (data || [])
      .filter(msg => msg.receiver_id === user.id && !msg.read_at)
      .map(msg => msg.id);

    if (unreadIds.length > 0) {
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);

      fetchUnreadCounts();
    }
  }, [currentDMUserId, user, fetchUnreadCounts]);

  // Fetch reactions for messages
  const fetchReactions = async (messageIds: string[], messageType: 'channel' | 'direct') => {
    if (messageIds.length === 0) return;

    const { data } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", messageIds)
      .eq("message_type", messageType);

    if (data) {
      const grouped: Record<string, Reaction[]> = {};
      data.forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r as Reaction);
      });
      setReactions(prev => ({ ...prev, ...grouped }));
    }
  };

  // Initial load
  useEffect(() => {
    if (user) {
      fetchProfiles();
      fetchChannels();
      fetchUnreadCounts();
    }
  }, [user, fetchProfiles, fetchChannels, fetchUnreadCounts]);

  // Refresh profiles periodically for online status
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchProfiles, 30000);
    return () => clearInterval(interval);
  }, [user, fetchProfiles]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (currentChannelId && view === "chat") {
      fetchChannelMessages();
    }
  }, [currentChannelId, view, fetchChannelMessages]);

  // Fetch DMs when DM user changes
  useEffect(() => {
    if (currentDMUserId && view === "dm") {
      fetchDirectMessages();
    }
  }, [currentDMUserId, view, fetchDirectMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, directMessages]);

  // Global presence tracking for online/offline status
  useEffect(() => {
    if (!user) return;

    const globalChannel = supabase.channel("global-presence", {
      config: { presence: { key: user.id } }
    });

    globalChannel
      .on("presence", { event: "sync" }, () => {
        const state = globalChannel.presenceState();
        const onlineIds = new Set(Object.keys(state));

        setOnlineUsers(prev =>
          prev.map(u => ({
            ...u,
            isOnline: onlineIds.has(u.id)
          }))
        );
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

  // Subscribe to realtime channel messages
  useEffect(() => {
    if (!currentChannelId || view !== "chat") return;

    const channel = supabase
      .channel(`chat-messages-${currentChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${currentChannelId}`
        },
        () => fetchChannelMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentChannelId, view, fetchChannelMessages]);

  // Subscribe to realtime direct messages
  useEffect(() => {
    if (!user) return;

    const dmChannel = supabase
      .channel(`dm-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages"
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          
          if (view === "dm" && currentDMUserId) {
            const isPartOfConversation = 
              (newMsg.sender_id === user.id && newMsg.receiver_id === currentDMUserId) ||
              (newMsg.sender_id === currentDMUserId && newMsg.receiver_id === user.id);
            
            if (isPartOfConversation) {
              fetchDirectMessages();
              return;
            }
          }
          
          if (payload.eventType === 'INSERT' && newMsg.receiver_id === user.id) {
            setOnlineUsers(prev => prev.map(u => 
              u.id === newMsg.sender_id 
                ? { ...u, unreadCount: (u.unreadCount || 0) + 1 }
                : u
            ));
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    dmChannelRef.current = dmChannel;

    return () => {
      supabase.removeChannel(dmChannel);
      dmChannelRef.current = null;
    };
  }, [user, view, currentDMUserId, fetchDirectMessages]);

  // Subscribe to reactions
  useEffect(() => {
    const channel = supabase
      .channel('reactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as Reaction;
            setReactions(prev => ({
              ...prev,
              [newReaction.message_id]: [...(prev[newReaction.message_id] || []), newReaction]
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldReaction = payload.old as Reaction;
            setReactions(prev => ({
              ...prev,
              [oldReaction.message_id]: (prev[oldReaction.message_id] || []).filter(r => r.id !== oldReaction.id)
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Typing presence for current channel
  useEffect(() => {
    if (!currentChannelId || !user || view !== "chat") return;

    const presenceChannel = supabase.channel(`typing-${currentChannelId}`, {
      config: { presence: { key: user.id } }
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing: TypingUser[] = [];

        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0] as { typing?: boolean; name?: string };
          if (presence?.typing && userId !== user.id) {
            typing.push({ id: userId, name: presence.name || "Someone" });
          }
        });

        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ typing: false, name: userName });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [currentChannelId, user, userName, view]);

  // Typing presence for DM
  useEffect(() => {
    if (!currentDMUserId || !user || view !== "dm") return;

    const conversationKey = [user.id, currentDMUserId].sort().join("-");
    const presenceChannel = supabase.channel(`dm-typing-${conversationKey}`, {
      config: { presence: { key: user.id } }
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing: TypingUser[] = [];

        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0] as { typing?: boolean; name?: string };
          if (presence?.typing && userId !== user.id) {
            typing.push({ id: userId, name: presence.name || "Someone" });
          }
        });

        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ typing: false, name: userName });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [currentDMUserId, user, userName, view]);

  const handleTyping = useCallback(() => {
    if (!presenceChannelRef.current) return;

    presenceChannelRef.current.track({ typing: true, name: userName });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      presenceChannelRef.current?.track({ typing: false, name: userName });
    }, 2000);
  }, [userName]);

  const handleSendChannelMessage = async () => {
    const text = input.trim();
    if (!text || !user || !currentChannelId) return;

    presenceChannelRef.current?.track({ typing: false, name: userName });

    const { error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: currentChannelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: userName,
        content: text,
        reply_to_id: replyTo?.id || null
      });

    if (error) {
      toast.error("Failed to send message");
      return;
    }

    setInput("");
    setReplyTo(null);
  };

  const handleSendDirectMessage = async () => {
    const text = input.trim();
    if (!text || !user || !currentDMUserId) return;

    presenceChannelRef.current?.track({ typing: false, name: userName });

    const { error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: user.id,
        receiver_id: currentDMUserId,
        content: text,
        reply_to_id: replyTo?.id || null
      });

    if (error) {
      toast.error("Failed to send message");
      return;
    }

    setInput("");
    setReplyTo(null);
  };

  const handleSendMessage = () => {
    if (view === "dm") {
      handleSendDirectMessage();
    } else {
      handleSendChannelMessage();
    }
  };

  const handleCreateChannel = async () => {
    const name = newChannelName.trim();
    if (!name || !user) return;

    const exists = channels.some(ch => ch.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast.error("Channel already exists");
      return;
    }

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create channel");
      return;
    }

    setChannels(prev => [...prev, data]);
    setNewChannelName("");
    setShowNewChannel(false);
    setCurrentChannelId(data.id);
    setView("chat");
  };

  const handleSelectChannel = (channelId: string) => {
    setCurrentChannelId(channelId);
    setCurrentDMUserId("");
    setChannelMessages([]);
    setTypingUsers([]);
    setReplyTo(null);
    setSearchQuery("");
    setShowSearch(false);
    setView("chat");
  };

  const handleSelectContact = (userId: string) => {
    setCurrentDMUserId(userId);
    setCurrentChannelId("");
    setDirectMessages([]);
    setTypingUsers([]);
    setReplyTo(null);
    setSearchQuery("");
    setShowSearch(false);
    
    setOnlineUsers(prev => prev.map(u => 
      u.id === userId ? { ...u, unreadCount: 0 } : u
    ));
    
    setView("dm");
  };

  const handleOpenChat = () => {
    setIsOpen(true);
  };

  const handleReaction = async (messageId: string, emoji: string, messageType: 'channel' | 'direct') => {
    if (!user) return;

    const existingReaction = reactions[messageId]?.find(
      r => r.user_id === user.id && r.emoji === emoji
    );

    if (existingReaction) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        message_type: messageType,
        user_id: user.id,
        user_email: user.email || "",
        emoji,
      });
    }
  };

  const handleEditMessage = async (messageId: string, isChannel: boolean) => {
    if (!editContent.trim()) return;

    const table = isChannel ? "chat_messages" : "direct_messages";
    const { error } = await supabase
      .from(table)
      .update({ content: editContent.trim(), edited_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) {
      toast.error("Failed to edit message");
      return;
    }

    setEditingMessageId(null);
    setEditContent("");
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.split("@")[0].slice(0, 2).toUpperCase();
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getDisplayName = (userId: string) => {
    const profile = profiles[userId];
    return profile?.full_name || profile?.email?.split("@")[0] || "User";
  };

  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    if (view === "dm") {
      return directMessages.find(m => m.id === replyToId);
    }
    return channelMessages.find(m => m.id === replyToId);
  };

  const renderReadReceipt = (msg: DirectMessage) => {
    if (!user || msg.sender_id !== user.id) return null;
    
    if (msg.read_at) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCheck className="h-3 w-3 text-teal inline-block ml-1" />
          </TooltipTrigger>
          <TooltipContent>
            Read {formatDistanceToNow(new Date(msg.read_at), { addSuffix: true })}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <Check className="h-3 w-3 text-muted-foreground inline-block ml-1" />;
  };

  const renderReactions = (messageId: string, messageType: 'channel' | 'direct') => {
    const msgReactions = reactions[messageId] || [];
    if (msgReactions.length === 0) return null;

    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    msgReactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_email);
      if (r.user_id === user?.id) grouped[r.emoji].hasOwn = true;
    });

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {Object.entries(grouped).map(([emoji, data]) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleReaction(messageId, emoji, messageType)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full border transition-colors",
                  data.hasOwn 
                    ? "bg-teal/20 border-teal/50 text-teal" 
                    : "bg-muted/50 border-border hover:bg-muted"
                )}
              >
                {emoji} {data.count}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {data.users.join(', ')}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  };

  const currentChannel = channels.find(ch => ch.id === currentChannelId);
  const currentDMUser = onlineUsers.find(u => u.id === currentDMUserId);

  const filteredChannelMessages = searchQuery
    ? channelMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : channelMessages;

  const filteredDirectMessages = searchQuery
    ? directMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : directMessages;

  if (!user) return null;

  return (
    <TooltipProvider>
      {/* Floating Button */}
      <button
        onClick={handleOpenChat}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center",
          "bg-teal text-teal-foreground shadow-lg hover:scale-105 transition-transform",
          "border-2 border-teal/30",
          isOpen && "hidden"
        )}
        style={{
          boxShadow: "0 0 20px hsl(174 72% 46% / 0.4), 0 0 40px hsl(174 72% 46% / 0.2)"
        }}
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-96 h-[32rem] rounded-lg flex flex-col overflow-hidden border border-teal/30"
          style={{
            backgroundColor: "hsl(var(--card))",
            boxShadow: "0 0 30px hsl(174 72% 46% / 0.3), 0 0 60px hsl(174 72% 46% / 0.15)"
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-teal text-teal-foreground">
            <div className="flex items-center gap-2">
              {(view === "chat" || view === "dm") && (
                <button
                  onClick={() => setView("contacts")}
                  className="hover:bg-teal-foreground/10 p-1 rounded"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <h3 className="font-semibold">
                {view === "contacts" && "Contacts"}
                {view === "channels" && "Channels"}
                {view === "chat" && `# ${currentChannel?.name || "Chat"}`}
                {view === "dm" && (currentDMUser?.name || "Direct Message")}
              </h3>
              {view === "dm" && currentDMUser && (
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  currentDMUser.isOnline ? "bg-success" : "bg-muted-foreground"
                )} />
              )}
            </div>
            <div className="flex items-center gap-1">
              {isSupported && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={async () => {
                        if (permissionStatus === 'granted') {
                          toast.info("Notifications are enabled");
                        } else {
                          const granted = await requestPermission();
                          if (granted) {
                            toast.success("Notifications enabled");
                          } else {
                            toast.error("Notifications blocked by browser");
                          }
                        }
                      }}
                      className="hover:bg-teal-foreground/10 p-1.5 rounded"
                      title="Notifications"
                    >
                      {permissionStatus === 'granted' ? (
                        <Bell className="h-4 w-4" />
                      ) : (
                        <BellOff className="h-4 w-4 opacity-60" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {permissionStatus === 'granted' 
                      ? "Notifications enabled" 
                      : permissionStatus === 'denied'
                      ? "Notifications blocked"
                      : "Enable notifications"}
                  </TooltipContent>
                </Tooltip>
              )}
              {(view === "chat" || view === "dm") && (
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className="hover:bg-teal-foreground/10 p-1.5 rounded"
                  title="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              {view === "contacts" && (
                <button
                  onClick={() => setView("channels")}
                  className="hover:bg-teal-foreground/10 p-1.5 rounded"
                  title="Channels"
                >
                  <Hash className="h-4 w-4" />
                </button>
              )}
              {view === "channels" && (
                <button
                  onClick={() => setView("contacts")}
                  className="hover:bg-teal-foreground/10 p-1.5 rounded"
                  title="Contacts"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-teal-foreground/10 p-1.5 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (view === "chat" || view === "dm") && (
            <div className="p-2 border-b">
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Contacts View */}
            {view === "contacts" && (
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {onlineUsers.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-4">No other users</p>
                  ) : (
                    onlineUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectContact(u.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={u.avatarUrl || undefined} />
                            <AvatarFallback className="bg-teal/20 text-teal text-sm">
                              {getInitials(u.name, u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                              u.isOnline ? "bg-success" : "bg-muted-foreground"
                            )}
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.isOnline ? "Online" : u.lastSeen 
                              ? `Last seen ${formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}`
                              : "Offline"
                            }
                          </p>
                        </div>
                        {(u.unreadCount || 0) > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {u.unreadCount}
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Channels View */}
            {view === "channels" && (
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch.id)}
                      className={cn(
                        "w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left",
                        currentChannelId === ch.id 
                          ? "bg-teal/20 text-teal" 
                          : "hover:bg-muted"
                      )}
                    >
                      <Hash className="h-4 w-4 shrink-0" />
                      <span className="font-medium text-sm">{ch.name}</span>
                    </button>
                  ))}

                  {showNewChannel ? (
                    <div className="p-2 space-y-2">
                      <Input
                        placeholder="Channel name"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleCreateChannel} className="flex-1">
                          Create
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowNewChannel(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewChannel(true)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="text-sm">New Channel</span>
                    </button>
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Channel Chat View */}
            {view === "chat" && (
              <>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    {filteredChannelMessages.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">
                        {searchQuery ? "No messages found" : "No messages yet. Start the conversation!"}
                      </p>
                    ) : (
                      filteredChannelMessages.map((msg) => {
                        const isOwn = msg.user_id === user.id;
                        const profile = profiles[msg.user_id];
                        const displayName = profile?.full_name || msg.user_name || msg.user_email.split("@")[0];
                        const replyMessage = getReplyMessage(msg.reply_to_id) as ChannelMessage | undefined;

                        return (
                          <div
                            key={msg.id}
                            className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
                          >
                            {!isOwn && (
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={profile?.avatar_url || undefined} />
                                <AvatarFallback className="bg-teal/20 text-teal text-xs">
                                  {getInitials(displayName, msg.user_email)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="max-w-[75%]">
                              {replyMessage && (
                                <div className={cn(
                                  "text-xs px-2 py-1 mb-1 rounded border-l-2 border-teal/50 bg-muted/50",
                                  isOwn && "ml-auto"
                                )}>
                                  <span className="font-medium text-teal/70">
                                    {profiles[replyMessage.user_id]?.full_name || replyMessage.user_name}
                                  </span>
                                  <p className="text-muted-foreground truncate">{replyMessage.content}</p>
                                </div>
                              )}
                              <div
                                className={cn(
                                  "p-2.5 rounded-lg group relative",
                                  isOwn ? "bg-teal text-teal-foreground" : "bg-muted"
                                )}
                              >
                                {!isOwn && (
                                  <p className="text-xs font-semibold mb-1 opacity-80">{displayName}</p>
                                )}
                                {editingMessageId === msg.id ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleEditMessage(msg.id, true);
                                        if (e.key === "Escape") setEditingMessageId(null);
                                      }}
                                      className="h-7 text-sm"
                                      autoFocus
                                    />
                                    <div className="flex gap-1">
                                      <Button size="sm" className="h-6 text-xs" onClick={() => handleEditMessage(msg.id, true)}>
                                        Save
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingMessageId(null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm">{msg.content}</p>
                                )}
                                <div className="flex items-center gap-1 mt-1">
                                  <span className={cn(
                                    "text-xs",
                                    isOwn ? "text-teal-foreground/70" : "text-muted-foreground"
                                  )}>
                                    {formatTime(msg.created_at)}
                                  </span>
                                  {msg.edited_at && (
                                    <span className="text-xs text-muted-foreground">(edited)</span>
                                  )}
                                </div>
                                {renderReactions(msg.id, 'channel')}
                                
                                {/* Message actions */}
                                <div className={cn(
                                  "absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-card border rounded-md shadow-sm p-0.5",
                                  isOwn ? "left-0" : "right-0"
                                )}>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="p-1 hover:bg-muted rounded" title="React">
                                        <Smile className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" align="end">
                                      <div className="flex gap-1">
                                        {COMMON_EMOJIS.map(emoji => (
                                          <button
                                            key={emoji}
                                            onClick={() => handleReaction(msg.id, emoji, 'channel')}
                                            className="text-lg hover:scale-125 transition-transform"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <button
                                    onClick={() => setReplyTo(msg)}
                                    className="p-1 hover:bg-muted rounded"
                                    title="Reply"
                                  >
                                    <Reply className="h-3 w-3" />
                                  </button>
                                  {isOwn && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditContent(msg.content);
                                      }}
                                      className="p-1 hover:bg-muted rounded"
                                      title="Edit"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="text-xs text-muted-foreground px-3 pb-1 flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
                    </span>
                    <span>
                      {typingUsers.length === 1
                        ? `${typingUsers[0].name} is typing...`
                        : `${typingUsers.length} people are typing...`}
                    </span>
                  </div>
                )}

                {/* Reply preview */}
                {replyTo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-t border-l-2 border-l-teal">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-teal">
                        {view === "chat" 
                          ? profiles[(replyTo as ChannelMessage).user_id]?.full_name || (replyTo as ChannelMessage).user_name
                          : getDisplayName((replyTo as DirectMessage).sender_id)
                        }
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-muted rounded">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Input */}
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={handleSendMessage} className="bg-teal hover:bg-teal/90">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Direct Message View */}
            {view === "dm" && (
              <>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    {filteredDirectMessages.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">
                        {searchQuery ? "No messages found" : "No messages yet. Start the conversation!"}
                      </p>
                    ) : (
                      filteredDirectMessages.map((msg) => {
                        const isOwn = msg.sender_id === user.id;
                        const senderId = msg.sender_id;
                        const profile = profiles[senderId];
                        const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";
                        const replyMessage = getReplyMessage(msg.reply_to_id) as DirectMessage | undefined;

                        return (
                          <div
                            key={msg.id}
                            className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
                          >
                            {!isOwn && (
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={profile?.avatar_url || undefined} />
                                <AvatarFallback className="bg-teal/20 text-teal text-xs">
                                  {getInitials(displayName, profile?.email || "")}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="max-w-[75%]">
                              {replyMessage && (
                                <div className={cn(
                                  "text-xs px-2 py-1 mb-1 rounded border-l-2 border-teal/50 bg-muted/50",
                                  isOwn && "ml-auto"
                                )}>
                                  <span className="font-medium text-teal/70">
                                    {getDisplayName(replyMessage.sender_id)}
                                  </span>
                                  <p className="text-muted-foreground truncate">{replyMessage.content}</p>
                                </div>
                              )}
                              <div
                                className={cn(
                                  "p-2.5 rounded-lg group relative",
                                  isOwn ? "bg-teal text-teal-foreground" : "bg-muted"
                                )}
                              >
                                {editingMessageId === msg.id ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleEditMessage(msg.id, false);
                                        if (e.key === "Escape") setEditingMessageId(null);
                                      }}
                                      className="h-7 text-sm"
                                      autoFocus
                                    />
                                    <div className="flex gap-1">
                                      <Button size="sm" className="h-6 text-xs" onClick={() => handleEditMessage(msg.id, false)}>
                                        Save
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingMessageId(null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm">{msg.content}</p>
                                )}
                                <div className="flex items-center gap-1 mt-1">
                                  <span className={cn(
                                    "text-xs",
                                    isOwn ? "text-teal-foreground/70" : "text-muted-foreground"
                                  )}>
                                    {formatTime(msg.created_at)}
                                  </span>
                                  {msg.edited_at && (
                                    <span className="text-xs text-muted-foreground">(edited)</span>
                                  )}
                                  {renderReadReceipt(msg)}
                                </div>
                                {renderReactions(msg.id, 'direct')}
                                
                                {/* Message actions */}
                                <div className={cn(
                                  "absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-card border rounded-md shadow-sm p-0.5",
                                  isOwn ? "left-0" : "right-0"
                                )}>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="p-1 hover:bg-muted rounded" title="React">
                                        <Smile className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" align="end">
                                      <div className="flex gap-1">
                                        {COMMON_EMOJIS.map(emoji => (
                                          <button
                                            key={emoji}
                                            onClick={() => handleReaction(msg.id, emoji, 'direct')}
                                            className="text-lg hover:scale-125 transition-transform"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <button
                                    onClick={() => setReplyTo(msg)}
                                    className="p-1 hover:bg-muted rounded"
                                    title="Reply"
                                  >
                                    <Reply className="h-3 w-3" />
                                  </button>
                                  {isOwn && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditContent(msg.content);
                                      }}
                                      className="p-1 hover:bg-muted rounded"
                                      title="Edit"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="text-xs text-muted-foreground px-3 pb-1 flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
                    </span>
                    <span>{currentDMUser?.name} is typing...</span>
                  </div>
                )}

                {/* Reply preview */}
                {replyTo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-t border-l-2 border-l-teal">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-teal">
                        {getDisplayName((replyTo as DirectMessage).sender_id)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-muted rounded">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Input */}
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder={`Message ${currentDMUser?.name || ""}...`}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={handleSendMessage} className="bg-teal hover:bg-teal/90">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </TooltipProvider>
  );
};

export default FloatingChat;
