import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  MessageCircle, X, Send, Users, Hash, Reply, ChevronLeft, Plus, Check, CheckCheck, 
  Smile, Search, Edit2, Bell, BellOff, Paperclip, Image, FileText, Download,
  MoreHorizontal, Pin, Trash2, ArrowDown, Wifi, WifiOff, RefreshCw, Volume2, VolumeX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useConnectionStatus, useTypingIndicator, validateMessage, formatMessageTime } from "@/hooks/useChatUtils";
import { useChatSounds } from "@/hooks/useChatSounds";

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

// Professional traditional color scheme
const CHAT_COLORS = {
  header: "bg-slate-800 dark:bg-slate-900",
  headerText: "text-white",
  accent: "bg-blue-600 hover:bg-blue-700",
  accentText: "text-white",
  ownMessage: "bg-blue-600 text-white",
  otherMessage: "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100",
  online: "bg-emerald-500",
  offline: "bg-slate-400",
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [stickyDate, setStickyDate] = useState<string | null>(null);
  const [showStickyDate, setShowStickyDate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalPresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dmChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSeenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const userName = teamMemberName || user?.email?.split("@")[0] || "";

  // Connection status tracking
  const { isConnected, isReconnecting, handleConnectionChange } = useConnectionStatus();

  // Typing indicator with proper debouncing
  const { startTyping, stopTyping } = useTypingIndicator(presenceChannelRef, userName);

  // Chat notifications hook
  const { requestPermission, toggleNotifications, notificationsEnabled, isSupported, permissionStatus } = useChatNotifications({
    isChatOpen: isOpen,
    currentChannelId,
    currentDMUserId,
  });

  // Chat sounds hook
  const { soundEnabled, toggleSound, playMessageSound, playSentSound } = useChatSounds();

  // Listen for openFloatingChat event from notifications
  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('openFloatingChat', handleOpenChat);
    return () => window.removeEventListener('openFloatingChat', handleOpenChat);
  }, []);

  // Format date for message groups
  const formatMessageDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  }, []);

  // Group messages by date
  const groupMessagesByDate = useCallback((messages: (ChannelMessage | DirectMessage)[]) => {
    const groups: { date: string; messages: typeof messages }[] = [];
    let currentDate = "";

    messages.forEach(msg => {
      const msgDate = formatMessageDate(msg.created_at);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    });

    return groups;
  }, [formatMessageDate]);

  // Handle scroll to check if scroll button should be shown and update sticky date
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 100;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom);
    
    // Find visible date separator for sticky header
    const dateSeparators = target.querySelectorAll('[data-date-separator]');
    let currentDate: string | null = null;
    
    dateSeparators.forEach((separator) => {
      const rect = separator.getBoundingClientRect();
      const containerRect = target.getBoundingClientRect();
      // If the separator is above or at the top of the visible area
      if (rect.top <= containerRect.top + 50) {
        currentDate = separator.getAttribute('data-date-separator');
      }
    });
    
    setStickyDate(currentDate);
    setShowStickyDate(target.scrollTop > 50 && currentDate !== null);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      if (smooth) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth"
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

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

    // Initialize online users with all profiles, deduplicated by email
    const now = new Date();
    const seenEmails = new Set<string>();
    const users: OnlineUser[] = (data || [])
      .filter(p => {
        // Exclude current user
        if (p.id === user?.id) return false;
        // Deduplicate by email
        const email = p.email?.toLowerCase() || '';
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
        return true;
      })
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

  // Fetch channel messages with loading state
  const fetchChannelMessages = useCallback(async () => {
    if (!currentChannelId) return;
    setIsLoading(true);

    try {
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
    } finally {
      setIsLoading(false);
    }
  }, [currentChannelId]);

  // Fetch direct messages for a conversation
  const fetchDirectMessages = useCallback(async () => {
    if (!currentDMUserId || !user) return;
    setIsLoading(true);

    try {
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
    } finally {
      setIsLoading(false);
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

  // Scroll to bottom when messages change (only if user was near bottom)
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timer = setTimeout(() => {
      if (isNearBottom) {
        scrollToBottom(false);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [channelMessages.length, directMessages.length, isNearBottom, scrollToBottom]);

  // Scroll to bottom when entering a chat
  useEffect(() => {
    if ((view === "chat" && currentChannelId) || (view === "dm" && currentDMUserId)) {
      const timer = setTimeout(() => {
        scrollToBottom(false);
        setIsNearBottom(true);
        setShowScrollButton(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [view, currentChannelId, currentDMUserId, scrollToBottom]);

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

    let lastMessageCount = channelMessages.length;

    const channel = supabase
      .channel(`chat-messages-${currentChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${currentChannelId}`
        },
        (payload) => {
          const newMsg = payload.new as ChannelMessage;
          // Play sound if message is from another user
          if (newMsg.user_id !== user?.id) {
            playMessageSound();
          }
          fetchChannelMessages();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${currentChannelId}`
        },
        () => fetchChannelMessages()
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
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
  }, [currentChannelId, view, fetchChannelMessages, user?.id, playMessageSound]);

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
              // Handle INSERT - new message
              if (payload.eventType === 'INSERT') {
                // Play sound for incoming message from other user
                if (newMsg.sender_id !== user.id) {
                  playMessageSound();
                }
                fetchDirectMessages();
                return;
              }
              
              // Handle UPDATE - includes read receipts
              if (payload.eventType === 'UPDATE') {
                // Update the message in local state for real-time read receipts
                setDirectMessages(prev => prev.map(msg => 
                  msg.id === newMsg.id ? { ...msg, ...newMsg } : msg
                ));
                return;
              }
            }
          }
          
          if (payload.eventType === 'INSERT' && newMsg.receiver_id === user.id) {
            // Play notification sound for messages when not in that conversation
            playMessageSound();
            setOnlineUsers(prev => prev.map(u => 
              u.id === newMsg.sender_id 
                ? { ...u, unreadCount: (u.unreadCount || 0) + 1 }
                : u
            ));
            setUnreadCount(prev => prev + 1);
          }
          
          // Handle UPDATE for messages we sent (read receipt notifications)
          if (payload.eventType === 'UPDATE' && newMsg.sender_id === user.id && newMsg.read_at) {
            // Update our sent messages with read receipt in real-time
            setDirectMessages(prev => prev.map(msg => 
              msg.id === newMsg.id ? { ...msg, read_at: newMsg.read_at } : msg
            ));
          }
        }
      )
      .subscribe();

    dmChannelRef.current = dmChannel;

    return () => {
      supabase.removeChannel(dmChannel);
      dmChannelRef.current = null;
    };
  }, [user, view, currentDMUserId, fetchDirectMessages, playMessageSound]);

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

  // Use the improved typing indicator from useChatUtils
  const handleTyping = useCallback(() => {
    startTyping();
  }, [startTyping]);

  const handleSendChannelMessage = async () => {
    const text = input.trim();
    
    // Validate message
    const validation = validateMessage(text);
    if (!validation.valid) {
      if (validation.error) toast.error(validation.error);
      return;
    }
    
    if (!user || !currentChannelId) return;

    // Stop typing indicator
    stopTyping();

    // Optimistic update - add message immediately
    const optimisticMessage: ChannelMessage = {
      id: `temp-${Date.now()}`,
      channel_id: currentChannelId,
      user_id: user.id,
      user_email: user.email || "",
      user_name: userName,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id || null,
    };

    setChannelMessages(prev => [...prev, optimisticMessage]);
    setInput("");
    setReplyTo(null);

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
      // Remove optimistic message on failure
      setChannelMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error("Failed to send message. Please try again.");
    }
  };

  const handleSendDirectMessage = async () => {
    const text = input.trim();
    
    // Validate message
    const validation = validateMessage(text);
    if (!validation.valid) {
      if (validation.error) toast.error(validation.error);
      return;
    }
    
    if (!user || !currentDMUserId) return;

    // Stop typing indicator
    stopTyping();

    // Optimistic update
    const optimisticMessage: DirectMessage = {
      id: `temp-${Date.now()}`,
      sender_id: user.id,
      receiver_id: currentDMUserId,
      content: text,
      created_at: new Date().toISOString(),
      read_at: null,
      reply_to_id: replyTo?.id || null,
    };

    setDirectMessages(prev => [...prev, optimisticMessage]);
    setInput("");
    setReplyTo(null);

    const { error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: user.id,
        receiver_id: currentDMUserId,
        content: text,
        reply_to_id: replyTo?.id || null
      });

    if (error) {
      // Remove optimistic message on failure
      setDirectMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error("Failed to send message. Please try again.");
    }
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
            <CheckCheck className="h-3 w-3 text-blue-400 inline-block ml-1" />
          </TooltipTrigger>
          <TooltipContent>
            Read {formatDistanceToNow(new Date(msg.read_at), { addSuffix: true })}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <Check className="h-3 w-3 text-slate-400 inline-block ml-1" />;
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
      <div className="flex flex-wrap gap-1 mt-1.5">
        {Object.entries(grouped).map(([emoji, data]) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleReaction(messageId, emoji, messageType)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full border transition-all",
                  data.hasOwn 
                    ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300" 
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
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

  const filteredChannelMessages = useMemo(() => 
    searchQuery
      ? channelMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      : channelMessages,
    [channelMessages, searchQuery]
  );

  const filteredDirectMessages = useMemo(() =>
    searchQuery
      ? directMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      : directMessages,
    [directMessages, searchQuery]
  );

  const filteredContacts = useMemo(() =>
    contactSearch
      ? onlineUsers.filter(u => 
          u.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(contactSearch.toLowerCase())
        )
      : onlineUsers,
    [onlineUsers, contactSearch]
  );

  const groupedChannelMessages = useMemo(() => 
    groupMessagesByDate(filteredChannelMessages),
    [filteredChannelMessages, groupMessagesByDate]
  );

  const groupedDirectMessages = useMemo(() =>
    groupMessagesByDate(filteredDirectMessages),
    [filteredDirectMessages, groupMessagesByDate]
  );

  if (!user) return null;

  return (
    <TooltipProvider>
      {/* Floating Button - Professional style */}
      <button
        onClick={handleOpenChat}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center",
          "bg-slate-800 dark:bg-slate-700 text-white shadow-xl hover:shadow-2xl",
          "hover:scale-105 transition-all duration-200 ease-out",
          "border border-slate-600",
          isOpen && "hidden"
        )}
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-medium w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Panel - Professional design */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 w-[380px] h-[520px] rounded-xl flex flex-col overflow-hidden",
            "shadow-2xl border border-slate-200 dark:border-slate-700",
            "bg-white dark:bg-slate-900 transition-all duration-300 ease-out",
            "animate-in slide-in-from-bottom-4 fade-in-0"
          )}
        >
          {/* Header - Traditional professional style */}
          <div className={cn(
            "flex items-center justify-between px-4 py-3",
            "bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800",
            "text-white border-b border-slate-600"
          )}>
            <div className="flex items-center gap-2">
              {(view === "chat" || view === "dm") && (
                <button
                  onClick={() => setView("contacts")}
                  className="hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <h3 className="font-semibold text-sm">
                  {view === "contacts" && "Messages"}
                  {view === "channels" && "Channels"}
                  {view === "chat" && `# ${currentChannel?.name || "Chat"}`}
                  {view === "dm" && (currentDMUser?.name || "Direct Message")}
                </h3>
                {view === "dm" && currentDMUser && (
                  <span className="text-xs text-slate-300 flex items-center gap-1">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      currentDMUser.isOnline ? "bg-emerald-400" : "bg-slate-500"
                    )} />
                    {currentDMUser.isOnline ? "Online" : "Offline"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {/* Connection status indicator */}
              {!isConnected && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs",
                      isReconnecting 
                        ? "bg-amber-500/20 text-amber-300" 
                        : "bg-red-500/20 text-red-300"
                    )}>
                      {isReconnecting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isReconnecting ? "Reconnecting..." : "Connection lost"}
                  </TooltipContent>
                </Tooltip>
              )}
              {isSupported && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={async () => {
                        if (permissionStatus !== 'granted') {
                          const granted = await requestPermission();
                          if (granted) {
                            toast.success("Push notifications enabled");
                          } else {
                            toast.error("Notifications blocked by browser");
                          }
                        } else {
                          toggleNotifications();
                          toast.info(notificationsEnabled ? "Notifications muted" : "Notifications unmuted");
                        }
                      }}
                      className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                    >
                      {permissionStatus === 'granted' && notificationsEnabled ? (
                        <Bell className="h-4 w-4" />
                      ) : (
                        <BellOff className="h-4 w-4 opacity-60" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {permissionStatus !== 'granted' 
                      ? permissionStatus === 'denied'
                        ? "Notifications blocked by browser"
                        : "Enable push notifications"
                      : notificationsEnabled
                        ? "Mute notifications" 
                        : "Unmute notifications"}
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Sound toggle button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSound}
                    className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                  >
                    {soundEnabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4 opacity-60" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {soundEnabled ? "Mute sounds" : "Unmute sounds"}
                </TooltipContent>
              </Tooltip>
              {(view === "chat" || view === "dm") && (
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className={cn(
                    "hover:bg-white/10 p-2 rounded-lg transition-colors",
                    showSearch && "bg-white/10"
                  )}
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              {view === "contacts" && (
                <button
                  onClick={() => setView("channels")}
                  className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                  title="Channels"
                >
                  <Hash className="h-4 w-4" />
                </button>
              )}
              {view === "channels" && (
                <button
                  onClick={() => setView("contacts")}
                  className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                  title="Contacts"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (view === "chat" || view === "dm") && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900">
            {/* Contacts View */}
            {view === "contacts" && (
              <div className="flex-1 flex flex-col">
                {/* Contact search */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search contacts..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="h-9 pl-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {filteredContacts.length === 0 ? (
                      <p className="text-center text-slate-500 text-sm py-8">No contacts found</p>
                    ) : (
                      filteredContacts.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleSelectContact(u.id)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
                            "hover:bg-white dark:hover:bg-slate-800 group",
                            "border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                          )}
                        >
                          <div className="relative">
                            <Avatar className="h-11 w-11 border-2 border-slate-200 dark:border-slate-700">
                              <AvatarImage src={u.avatarUrl || undefined} />
                              <AvatarFallback className={cn(getAvatarColor(u.email || u.name), "text-white text-sm font-medium")}>
                                {getInitials(u.name, u.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-50 dark:border-slate-900",
                                u.isOnline ? "bg-emerald-500" : "bg-slate-400"
                              )}
                            />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{u.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {u.isOnline ? "Online" : u.lastSeen 
                                ? `Active ${formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}`
                                : "Offline"
                              }
                            </p>
                          </div>
                          {(u.unreadCount || 0) > 0 && (
                            <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs px-2 py-0.5">
                              {u.unreadCount}
                            </Badge>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Channels View */}
            {view === "channels" && (
              <ScrollArea className="flex-1">
                <div className="p-2">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch.id)}
                      className={cn(
                        "w-full flex items-center gap-2 p-3 rounded-lg transition-all text-left",
                        "hover:bg-white dark:hover:bg-slate-800",
                        currentChannelId === ch.id 
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" 
                          : "border border-transparent"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        currentChannelId === ch.id
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-slate-100 dark:bg-slate-800"
                      )}>
                        <Hash className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-sm">{ch.name}</span>
                    </button>
                  ))}

                  {showNewChannel ? (
                    <div className="p-3 mt-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Input
                        placeholder="Channel name"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                        className="mb-2"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleCreateChannel} className="flex-1 bg-blue-600 hover:bg-blue-700">
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
                      className={cn(
                        "w-full flex items-center gap-2 p-3 rounded-lg transition-all",
                        "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                        "hover:bg-white dark:hover:bg-slate-800",
                        "border border-dashed border-slate-300 dark:border-slate-700 mt-2"
                      )}
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
                {/* Sticky date header */}
                <div className={cn(
                  "absolute top-0 left-0 right-0 z-20 flex justify-center py-2 transition-all duration-200",
                  showStickyDate && stickyDate
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-2 pointer-events-none"
                )}>
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium px-3 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                    {stickyDate}
                  </span>
                </div>
                
                <ScrollArea 
                  className="flex-1 px-3 py-2" 
                  viewportRef={scrollViewportRef}
                  onScrollChange={handleScroll}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {groupedChannelMessages.length === 0 ? (
                        <div className="text-center py-12">
                          <MessageCircle className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                          <p className="text-slate-500 text-sm">
                            {searchQuery ? "No messages found" : "No messages yet"}
                          </p>
                          <p className="text-slate-400 text-xs mt-1">Start the conversation!</p>
                        </div>
                      ) : (
                        groupedChannelMessages.map((group) => (
                          <div key={group.date}>
                            <div className="flex items-center gap-2 my-3" data-date-separator={group.date}>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                              <span className="text-xs text-slate-500 font-medium px-2">{group.date}</span>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                            </div>
                            <div className="space-y-2">
                              {group.messages.map((msg) => {
                                const channelMsg = msg as ChannelMessage;
                                const isOwn = channelMsg.user_id === user.id;
                                const profile = profiles[channelMsg.user_id];
                                const displayName = profile?.full_name || channelMsg.user_name || channelMsg.user_email.split("@")[0];
                                const replyMessage = getReplyMessage(channelMsg.reply_to_id) as ChannelMessage | undefined;

                                return (
                                  <div
                                    key={channelMsg.id}
                                    className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
                                  >
                                    {!isOwn && (
                                      <Avatar className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-700">
                                        <AvatarImage src={profile?.avatar_url || undefined} />
                                        <AvatarFallback className={cn(getAvatarColor(channelMsg.user_email), "text-white text-xs")}>
                                          {getInitials(displayName, channelMsg.user_email)}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                    <div className="max-w-[75%]">
                                      {replyMessage && (
                                        <div className={cn(
                                          "text-xs px-2 py-1 mb-1 rounded-md border-l-2 border-blue-400 bg-slate-100 dark:bg-slate-800",
                                          isOwn && "ml-auto"
                                        )}>
                                          <span className="font-medium text-blue-600 dark:text-blue-400">
                                            {profiles[replyMessage.user_id]?.full_name || replyMessage.user_name}
                                          </span>
                                          <p className="text-slate-500 truncate">{replyMessage.content}</p>
                                        </div>
                                      )}
                                      <div
                                        className={cn(
                                          "p-3 rounded-2xl group relative",
                                          isOwn 
                                            ? "bg-blue-600 text-white rounded-br-md" 
                                            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md shadow-sm border border-slate-200 dark:border-slate-700"
                                        )}
                                      >
                                        {!isOwn && (
                                          <p className="text-xs font-semibold mb-1 text-blue-600 dark:text-blue-400">{displayName}</p>
                                        )}
                                        {editingMessageId === channelMsg.id ? (
                                          <div className="space-y-2">
                                            <Input
                                              value={editContent}
                                              onChange={(e) => setEditContent(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") handleEditMessage(channelMsg.id, true);
                                                if (e.key === "Escape") setEditingMessageId(null);
                                              }}
                                              className="h-7 text-sm"
                                              autoFocus
                                            />
                                            <div className="flex gap-1">
                                              <Button size="sm" className="h-6 text-xs" onClick={() => handleEditMessage(channelMsg.id, true)}>
                                                Save
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingMessageId(null)}>
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm leading-relaxed">{channelMsg.content}</p>
                                        )}
                                        <div className="flex items-center gap-1 mt-1.5">
                                          <span className={cn(
                                            "text-[10px]",
                                            isOwn ? "text-blue-200" : "text-slate-400"
                                          )}>
                                            {formatTime(channelMsg.created_at)}
                                          </span>
                                          {channelMsg.edited_at && (
                                            <span className="text-[10px] text-slate-400">(edited)</span>
                                          )}
                                        </div>
                                        {renderReactions(channelMsg.id, 'channel')}
                                        
                                        {/* Message actions */}
                                        <div className={cn(
                                          "absolute -top-2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5",
                                          "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1",
                                          isOwn ? "left-0" : "right-0"
                                        )}>
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors" title="React">
                                                <Smile className="h-3.5 w-3.5 text-slate-500" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-2" align="end">
                                              <div className="flex gap-1">
                                                {COMMON_EMOJIS.map(emoji => (
                                                  <button
                                                    key={emoji}
                                                    onClick={() => handleReaction(channelMsg.id, emoji, 'channel')}
                                                    className="text-lg hover:scale-125 transition-transform p-1"
                                                  >
                                                    {emoji}
                                                  </button>
                                                ))}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                          <button
                                            onClick={() => setReplyTo(channelMsg)}
                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                            title="Reply"
                                          >
                                            <Reply className="h-3.5 w-3.5 text-slate-500" />
                                          </button>
                                          {isOwn && (
                                            <button
                                              onClick={() => {
                                                setEditingMessageId(channelMsg.id);
                                                setEditContent(channelMsg.content);
                                              }}
                                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                              title="Edit"
                                            >
                                              <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Scroll to bottom button with smooth transition */}
                <div className={cn(
                  "absolute bottom-24 left-1/2 -translate-x-1/2 transition-all duration-200 z-10",
                  showScrollButton 
                    ? "opacity-100 translate-y-0" 
                    : "opacity-0 translate-y-2 pointer-events-none"
                )}>
                  <button
                    onClick={() => scrollToBottom()}
                    className={cn(
                      "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200",
                      "shadow-lg border border-slate-200 dark:border-slate-700",
                      "p-2.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700",
                      "hover:scale-110 active:scale-95 transition-all duration-150",
                      "flex items-center justify-center"
                    )}
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="text-xs text-slate-500 px-4 pb-1 flex items-center gap-2">
                    <span className="flex gap-0.5">
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
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
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900">
                    <div className="w-1 h-8 bg-blue-500 rounded-full" />
                    <Reply className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Replying to {view === "chat" 
                          ? profiles[(replyTo as ChannelMessage).user_id]?.full_name || (replyTo as ChannelMessage).user_name
                          : getDisplayName((replyTo as DirectMessage).sender_id)
                        }
                      </p>
                      <p className="text-xs text-slate-500 truncate">{replyTo.content}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors">
                      <X className="h-3.5 w-3.5 text-blue-500" />
                    </button>
                  </div>
                )}

                {/* Input area */}
                <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <Input
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          handleTyping();
                        }}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                        className="pr-10 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-blue-500"
                      />
                    </div>
                    <Button 
                      size="icon" 
                      onClick={handleSendMessage} 
                      className="bg-blue-600 hover:bg-blue-700 shrink-0"
                      disabled={!input.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Direct Message View */}
            {view === "dm" && (
              <>
                {/* Sticky date header */}
                <div className={cn(
                  "absolute top-0 left-0 right-0 z-20 flex justify-center py-2 transition-all duration-200",
                  showStickyDate && stickyDate
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-2 pointer-events-none"
                )}>
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium px-3 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                    {stickyDate}
                  </span>
                </div>
                
                <ScrollArea 
                  className="flex-1 px-3 py-2"
                  viewportRef={scrollViewportRef}
                  onScrollChange={handleScroll}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {groupedDirectMessages.length === 0 ? (
                        <div className="text-center py-12">
                          <MessageCircle className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                          <p className="text-slate-500 text-sm">
                            {searchQuery ? "No messages found" : "No messages yet"}
                          </p>
                          <p className="text-slate-400 text-xs mt-1">Say hello!</p>
                        </div>
                      ) : (
                        groupedDirectMessages.map((group) => (
                          <div key={group.date}>
                            <div className="flex items-center gap-2 my-3" data-date-separator={group.date}>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                              <span className="text-xs text-slate-500 font-medium px-2">{group.date}</span>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                            </div>
                            <div className="space-y-2">
                              {group.messages.map((msg) => {
                                const dmMsg = msg as DirectMessage;
                                const isOwn = dmMsg.sender_id === user.id;
                                const senderId = dmMsg.sender_id;
                                const profile = profiles[senderId];
                                const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";
                                const replyMessage = getReplyMessage(dmMsg.reply_to_id) as DirectMessage | undefined;

                                return (
                                  <div
                                    key={dmMsg.id}
                                    className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
                                  >
                                    {!isOwn && (
                                      <Avatar className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-700">
                                        <AvatarImage src={profile?.avatar_url || undefined} />
                                        <AvatarFallback className={cn(getAvatarColor(profile?.email || displayName), "text-white text-xs")}>
                                          {getInitials(displayName, profile?.email || "")}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                    <div className="max-w-[75%]">
                                      {replyMessage && (
                                        <div className={cn(
                                          "text-xs px-2 py-1 mb-1 rounded-md border-l-2 border-blue-400 bg-slate-100 dark:bg-slate-800",
                                          isOwn && "ml-auto"
                                        )}>
                                          <span className="font-medium text-blue-600 dark:text-blue-400">
                                            {getDisplayName(replyMessage.sender_id)}
                                          </span>
                                          <p className="text-slate-500 truncate">{replyMessage.content}</p>
                                        </div>
                                      )}
                                      <div
                                        className={cn(
                                          "p-3 rounded-2xl group relative",
                                          isOwn 
                                            ? "bg-blue-600 text-white rounded-br-md" 
                                            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md shadow-sm border border-slate-200 dark:border-slate-700"
                                        )}
                                      >
                                        {editingMessageId === dmMsg.id ? (
                                          <div className="space-y-2">
                                            <Input
                                              value={editContent}
                                              onChange={(e) => setEditContent(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") handleEditMessage(dmMsg.id, false);
                                                if (e.key === "Escape") setEditingMessageId(null);
                                              }}
                                              className="h-7 text-sm"
                                              autoFocus
                                            />
                                            <div className="flex gap-1">
                                              <Button size="sm" className="h-6 text-xs" onClick={() => handleEditMessage(dmMsg.id, false)}>
                                                Save
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingMessageId(null)}>
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm leading-relaxed">{dmMsg.content}</p>
                                        )}
                                        <div className="flex items-center gap-1 mt-1.5">
                                          <span className={cn(
                                            "text-[10px]",
                                            isOwn ? "text-blue-200" : "text-slate-400"
                                          )}>
                                            {formatTime(dmMsg.created_at)}
                                          </span>
                                          {dmMsg.edited_at && (
                                            <span className="text-[10px] text-slate-400">(edited)</span>
                                          )}
                                          {renderReadReceipt(dmMsg)}
                                        </div>
                                        {renderReactions(dmMsg.id, 'direct')}
                                        
                                        {/* Message actions */}
                                        <div className={cn(
                                          "absolute -top-2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5",
                                          "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1",
                                          isOwn ? "left-0" : "right-0"
                                        )}>
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors" title="React">
                                                <Smile className="h-3.5 w-3.5 text-slate-500" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-2" align="end">
                                              <div className="flex gap-1">
                                                {COMMON_EMOJIS.map(emoji => (
                                                  <button
                                                    key={emoji}
                                                    onClick={() => handleReaction(dmMsg.id, emoji, 'direct')}
                                                    className="text-lg hover:scale-125 transition-transform p-1"
                                                  >
                                                    {emoji}
                                                  </button>
                                                ))}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                          <button
                                            onClick={() => setReplyTo(dmMsg)}
                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                            title="Reply"
                                          >
                                            <Reply className="h-3.5 w-3.5 text-slate-500" />
                                          </button>
                                          {isOwn && (
                                            <button
                                              onClick={() => {
                                                setEditingMessageId(dmMsg.id);
                                                setEditContent(dmMsg.content);
                                              }}
                                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                              title="Edit"
                                            >
                                              <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Scroll to bottom button with smooth transition */}
                <div className={cn(
                  "absolute bottom-24 left-1/2 -translate-x-1/2 transition-all duration-200 z-10",
                  showScrollButton 
                    ? "opacity-100 translate-y-0" 
                    : "opacity-0 translate-y-2 pointer-events-none"
                )}>
                  <button
                    onClick={() => scrollToBottom()}
                    className={cn(
                      "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200",
                      "shadow-lg border border-slate-200 dark:border-slate-700",
                      "p-2.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700",
                      "hover:scale-110 active:scale-95 transition-all duration-150",
                      "flex items-center justify-center"
                    )}
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="text-xs text-slate-500 px-4 pb-1 flex items-center gap-2">
                    <span className="flex gap-0.5">
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                      <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                    </span>
                    <span>{typingUsers[0].name} is typing...</span>
                  </div>
                )}

                {/* Reply preview */}
                {replyTo && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900">
                    <div className="w-1 h-8 bg-blue-500 rounded-full" />
                    <Reply className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Replying to {getDisplayName((replyTo as DirectMessage).sender_id)}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{replyTo.content}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors">
                      <X className="h-3.5 w-3.5 text-blue-500" />
                    </button>
                  </div>
                )}

                {/* Input area */}
                <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <Input
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          handleTyping();
                        }}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                        className="pr-10 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-blue-500"
                      />
                    </div>
                    <Button 
                      size="icon" 
                      onClick={handleSendMessage} 
                      className="bg-blue-600 hover:bg-blue-700 shrink-0"
                      disabled={!input.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
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
