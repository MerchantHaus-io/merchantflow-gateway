import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  MessageCircle, X, Send, Users, Hash, Reply, ChevronLeft, Plus, Check, CheckCheck, 
  Smile, Search, Edit2, Bell, BellOff, Paperclip, Image, FileText, Download,
  MoreHorizontal, Pin, Trash2, ArrowDown, Wifi, WifiOff, RefreshCw, Volume2, VolumeX,
  Minus, Mic, MicOff, Square, File
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { isEmailAllowed } from "@/types/opportunity";
import { UserProfileModal } from "@/components/UserProfileModal";

type DirectMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  edited_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
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
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
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

type ChatView = "contacts" | "chat" | "dm";

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: ['😀', '😃', '😄', '😁', '😆', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤔', '🫣', '🤭', '😐', '😑', '😶', '🙄', '😏', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'] },
  { label: "Gestures", emojis: ['👍', '👎', '👌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '💪', '🫶', '👏', '🫡'] },
  { label: "Hearts", emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { label: "Objects", emojis: ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🏆', '🥇', '🎯', '💡', '📌', '📎', '📊', '📈', '💰', '💎', '🔑', '🛠️', '⚡', '🚀', '💼', '📱', '💻'] },
  { label: "Faces", emojis: ['😎', '🤓', '🧐', '😤', '😠', '🤬', '😈', '👿', '💀', '☠️', '🤡', '👻', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
];

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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [channelUnreadCounts, setChannelUnreadCounts] = useState<Record<string, number>>({});
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
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [showStickyDate, setShowStickyDate] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; url: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalPresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dmChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSeenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobile();
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

  // Use refs to avoid stale closures
  const viewRef = useRef(view);
  const currentDMUserIdRef = useRef(currentDMUserId);
  const currentChannelIdRef = useRef(currentChannelId);
  
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { currentDMUserIdRef.current = currentDMUserId; }, [currentDMUserId]);
  useEffect(() => { currentChannelIdRef.current = currentChannelId; }, [currentChannelId]);

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

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 100;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom);
    
    const dateSeparators = target.querySelectorAll('[data-date-separator]');
    let currentDate: string | null = null;
    
    dateSeparators.forEach((separator) => {
      const rect = separator.getBoundingClientRect();
      const containerRect = target.getBoundingClientRect();
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
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  // Update last_seen
  useEffect(() => {
    if (!user) return;
    const updateLastSeen = async () => {
      await supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id);
    };
    updateLastSeen();
    lastSeenIntervalRef.current = setInterval(updateLastSeen, 15000);
    return () => { if (lastSeenIntervalRef.current) clearInterval(lastSeenIntervalRef.current); };
  }, [user]);

  // Fetch profiles
  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id, avatar_url, full_name, email, last_seen");
    if (error) { console.error("Failed to load profiles:", error); return; }

    const profileMap: Record<string, Profile> = {};
    (data || []).forEach(p => { profileMap[p.id] = p; });
    setProfiles(profileMap);

    const now = new Date();
    const seenEmails = new Set<string>();
    const users: OnlineUser[] = (data || [])
      .filter(p => {
        if (p.id === user?.id) return false;
        if (!isEmailAllowed(p.email)) return false;
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

  // Fetch unread DM counts
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from("direct_messages").select("sender_id").eq("receiver_id", user.id).is("read_at", null);
    if (error) { console.error("Failed to fetch unread counts:", error); return; }

    const counts: Record<string, number> = {};
    (data || []).forEach(msg => { counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1; });

    setOnlineUsers(prev => prev.map(u => ({ ...u, unreadCount: counts[u.id] || 0 })));
    setUnreadCount((data || []).length);
  }, [user]);

  // Channel last-read from localStorage
  const getChannelLastRead = useCallback((): Record<string, string> => {
    if (!user) return {};
    try {
      const stored = localStorage.getItem(`chat_last_read_${user.id}`);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }, [user]);

  const markChannelRead = useCallback((channelId: string) => {
    if (!user) return;
    const timestamps = getChannelLastRead();
    timestamps[channelId] = new Date().toISOString();
    localStorage.setItem(`chat_last_read_${user.id}`, JSON.stringify(timestamps));
    setChannelUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
  }, [user, getChannelLastRead]);

  // Fetch channel unread counts - single aggregated query instead of N+1
  const fetchChannelUnreadCounts = useCallback(async () => {
    if (!user || channels.length === 0) return;
    const lastReadTimestamps = getChannelLastRead();
    
    // Use a single query to get all unread counts at once
    const counts: Record<string, number> = {};
    
    // Get the earliest last-read timestamp to use as a baseline filter
    const channelIds = channels.map(ch => ch.id);
    
    const { data, error } = await supabase
      .from("chat_messages")
      .select("channel_id")
      .in("channel_id", channelIds)
      .neq("user_id", user.id);
    
    if (error || !data) return;
    
    // Count messages per channel that are after the last-read timestamp
    data.forEach(msg => {
      const lastRead = lastReadTimestamps[msg.channel_id];
      // If no lastRead, count all messages; if lastRead exists, we can't filter by timestamp in this approach
      // so we accept a slight over-count on initial load (corrected when user opens channel)
      if (!lastRead) {
        counts[msg.channel_id] = (counts[msg.channel_id] || 0) + 1;
      }
    });
    
    // For channels with a lastRead timestamp, do a single filtered query
    const channelsWithLastRead = channels.filter(ch => lastReadTimestamps[ch.id]);
    if (channelsWithLastRead.length > 0) {
      for (const ch of channelsWithLastRead) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", ch.id)
          .neq("user_id", user.id)
          .gt("created_at", lastReadTimestamps[ch.id]);
        counts[ch.id] = count || 0;
      }
    }

    setChannelUnreadCounts(counts);
  }, [user, channels, getChannelLastRead]);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    const { data, error } = await supabase.from("chat_channels").select("*").order("created_at", { ascending: true });
    if (error) { console.error("Failed to load channels:", error); return; }
    setChannels(data || []);
  }, []);

  // Fetch channel messages - only called on initial load, not on every realtime event
  const fetchChannelMessages = useCallback(async () => {
    if (!currentChannelId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("channel_id", currentChannelId).order("created_at", { ascending: true });
      if (error) { console.error("Failed to load messages:", error); return; }
      setChannelMessages(data || []);
      fetchReactions((data || []).map(m => m.id), 'channel');
    } finally {
      setIsLoading(false);
    }
  }, [currentChannelId]);

  // Fetch direct messages
  const fetchDirectMessages = useCallback(async () => {
    if (!currentDMUserId || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${currentDMUserId}),and(sender_id.eq.${currentDMUserId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (error) { console.error("Failed to load direct messages:", error); return; }
      setDirectMessages(data || []);
      fetchReactions((data || []).map(m => m.id), 'direct');

      const unreadIds = (data || []).filter(msg => msg.receiver_id === user.id && !msg.read_at).map(msg => msg.id);
      if (unreadIds.length > 0) {
        await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
        fetchUnreadCounts();
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentDMUserId, user, fetchUnreadCounts]);

  // Fetch reactions
  const fetchReactions = async (messageIds: string[], messageType: 'channel' | 'direct') => {
    if (messageIds.length === 0) return;
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", messageIds).eq("message_type", messageType);
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

  // Fetch channel unreads once channels loaded
  useEffect(() => {
    if (channels.length > 0) fetchChannelUnreadCounts();
  }, [channels, fetchChannelUnreadCounts]);

  // Refresh profiles on realtime updates only (no polling interval)
  useEffect(() => {
    if (!user) return;
    const profileChannel = supabase
      .channel('profiles-last-seen')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => { fetchProfiles(); })
      .subscribe();
    return () => { supabase.removeChannel(profileChannel); };
  }, [user, fetchProfiles]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (currentChannelId && view === "chat") fetchChannelMessages();
  }, [currentChannelId, view, fetchChannelMessages]);

  // Fetch DMs when DM user changes
  useEffect(() => {
    if (currentDMUserId && view === "dm") fetchDirectMessages();
  }, [currentDMUserId, view, fetchDirectMessages]);

  // Scroll to bottom when messages change (only if near bottom)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isNearBottom) scrollToBottom(false);
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

  // Global presence tracking
  useEffect(() => {
    if (!user) return;
    const globalChannel = supabase.channel("global-presence", { config: { presence: { key: user.id } } });
    globalChannel
      .on("presence", { event: "sync" }, () => {
        const state = globalChannel.presenceState();
        const presenceOnlineIds = new Set(Object.keys(state));
        setOnlineUsers(prev =>
          prev.map(u => {
            const isPresenceOnline = presenceOnlineIds.has(u.id);
            const lastSeenRecent = u.lastSeen ? (Date.now() - new Date(u.lastSeen).getTime()) < 120000 : false;
            return {
              ...u,
              isOnline: isPresenceOnline || lastSeenRecent,
              lastSeen: isPresenceOnline ? new Date().toISOString() : u.lastSeen
            };
          })
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await globalChannel.track({ name: userName, email: user.email, online_at: new Date().toISOString() });
        }
      });
    globalPresenceRef.current = globalChannel;
    return () => { supabase.removeChannel(globalChannel); globalPresenceRef.current = null; };
  }, [user, userName]);

  // *** FIX: Realtime channel messages - append locally instead of re-fetching ***
  useEffect(() => {
    if (!currentChannelId || view !== "chat") return;

    const channel = supabase
      .channel(`chat-messages-${currentChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` },
        (payload) => {
          const newMsg = payload.new as ChannelMessage;
          // Append locally instead of full re-fetch (prevents freeze)
          setChannelMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            // Remove optimistic message
            const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.user_id === newMsg.user_id));
            return [...filtered, newMsg];
          });
          if (newMsg.user_id !== user?.id) playMessageSound();
          markChannelRead(currentChannelId);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` },
        (payload) => {
          const updated = payload.new as ChannelMessage;
          setChannelMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` },
        (payload) => {
          const deleted = payload.old as { id: string };
          setChannelMessages(prev => prev.filter(m => m.id !== deleted.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentChannelId, view, user?.id, playMessageSound, markChannelRead]);

  // Subscribe to all channel messages for unread badge updates
  useEffect(() => {
    if (!user) return;
    const allChannelMsgs = supabase
      .channel('all-channel-msgs-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as ChannelMessage;
          if (msg.user_id === user.id) return;
          if (viewRef.current === 'chat' && msg.channel_id === currentChannelIdRef.current) return;
          setChannelUnreadCounts(prev => ({ ...prev, [msg.channel_id]: (prev[msg.channel_id] || 0) + 1 }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(allChannelMsgs); };
  }, [user]);

  // *** FIX: DM realtime - use filtered channels to only receive own messages ***
  useEffect(() => {
    if (!user) return;

    const handleDMEvent = (payload: { eventType: string; new: unknown; old: unknown }) => {
      const newMsg = payload.new as DirectMessage;
      // Extra safety: skip messages not involving current user
      if (newMsg.sender_id !== user.id && newMsg.receiver_id !== user.id) return;
      
      const currentView = viewRef.current;
      const currentDM = currentDMUserIdRef.current;
      
      if (currentView === "dm" && currentDM) {
        const isPartOfConversation = 
          (newMsg.sender_id === user.id && newMsg.receiver_id === currentDM) ||
          (newMsg.sender_id === currentDM && newMsg.receiver_id === user.id);
        
        if (isPartOfConversation) {
          if (payload.eventType === 'INSERT') {
            if (newMsg.sender_id !== user.id) {
              playMessageSound();
              // Auto-mark as read since we're viewing this conversation
              supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id).then(() => {
                fetchUnreadCounts();
              });
            }
            setDirectMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.sender_id === newMsg.sender_id));
              return [...filtered, { ...newMsg, read_at: newMsg.receiver_id === user.id ? new Date().toISOString() : newMsg.read_at }];
            });
            return;
          }
          if (payload.eventType === 'UPDATE') {
            setDirectMessages(prev => prev.map(msg => msg.id === newMsg.id ? { ...msg, ...newMsg } : msg));
            return;
          }
        }
      }
      
      if (payload.eventType === 'INSERT' && newMsg.receiver_id === user.id) {
        const isViewingConversation = currentView === "dm" && currentDM === newMsg.sender_id;
        if (!isViewingConversation) {
          playMessageSound();
          setOnlineUsers(prev => prev.map(u => u.id === newMsg.sender_id ? { ...u, unreadCount: (u.unreadCount || 0) + 1 } : u));
          setUnreadCount(prev => prev + 1);
        }
      }
      
      if (payload.eventType === 'UPDATE' && newMsg.sender_id === user.id && newMsg.read_at) {
        setDirectMessages(prev => prev.map(msg => msg.id === newMsg.id ? { ...msg, read_at: newMsg.read_at } : msg));
      }
    };

    // Use two filtered channels - one for received, one for sent
    const dmReceivedChannel = supabase
      .channel(`dm-received-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${user.id}` }, handleDMEvent)
      .subscribe();

    const dmSentChannel = supabase
      .channel(`dm-sent-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, handleDMEvent)
      .subscribe();

    return () => { 
      supabase.removeChannel(dmReceivedChannel); 
      supabase.removeChannel(dmSentChannel); 
    };
  }, [user, playMessageSound]);

  // Reactions subscription
  useEffect(() => {
    const channel = supabase
      .channel('reactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as Reaction;
            setReactions(prev => ({ ...prev, [newReaction.message_id]: [...(prev[newReaction.message_id] || []), newReaction] }));
          } else if (payload.eventType === 'DELETE') {
            const oldReaction = payload.old as Reaction;
            setReactions(prev => ({ ...prev, [oldReaction.message_id]: (prev[oldReaction.message_id] || []).filter(r => r.id !== oldReaction.id) }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Typing presence for current channel
  useEffect(() => {
    if (!currentChannelId || !user || view !== "chat") return;
    const presenceChannel = supabase.channel(`typing-${currentChannelId}`, { config: { presence: { key: user.id } } });
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
        if (status === "SUBSCRIBED") await presenceChannel.track({ typing: false, name: userName });
      });
    presenceChannelRef.current = presenceChannel;
    return () => { supabase.removeChannel(presenceChannel); presenceChannelRef.current = null; };
  }, [currentChannelId, user, userName, view]);

  // Typing presence for DM
  useEffect(() => {
    if (!currentDMUserId || !user || view !== "dm") return;
    const conversationKey = [user.id, currentDMUserId].sort().join("-");
    const presenceChannel = supabase.channel(`dm-typing-${conversationKey}`, { config: { presence: { key: user.id } } });
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
        if (status === "SUBSCRIBED") await presenceChannel.track({ typing: false, name: userName });
      });
    presenceChannelRef.current = presenceChannel;
    return () => { supabase.removeChannel(presenceChannel); presenceChannelRef.current = null; };
  }, [currentDMUserId, user, userName, view]);

  const handleTyping = useCallback(() => { startTyping(); }, [startTyping]);

  // Upload attachment to storage
  const uploadAttachment = async (file: File): Promise<{ url: string; name: string; type: string; size: number } | null> => {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${user?.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    
    const { error } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (error) {
      toast.error("Failed to upload file");
      return null;
    }

    const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type, size: file.size };
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    const url = URL.createObjectURL(file);
    setPendingAttachment({ file, url });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const fileName = `voice-note-${Date.now()}.webm`;
        const file = new window.File([blob], fileName, { type: 'audio/webm' });
        
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setRecordingTime(0);
        setIsRecording(false);
        
        // Upload and send
        const attachment = await uploadAttachment(file);
        if (attachment) {
          await sendMessageWithAttachment("🎙️ Voice note", attachment);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  // Send message with attachment
  const sendMessageWithAttachment = async (content: string, attachment: { url: string; name: string; type: string; size: number }) => {
    if (!user) return;

    if (view === "chat" && currentChannelId) {
      const { error } = await supabase.from("chat_messages").insert({
        channel_id: currentChannelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: userName,
        content,
        attachment_url: attachment.url,
        attachment_name: attachment.name,
        attachment_type: attachment.type,
        attachment_size: attachment.size,
      });
      if (error) toast.error("Failed to send");
    } else if (view === "dm" && currentDMUserId) {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: currentDMUserId,
        content,
        attachment_url: attachment.url,
        attachment_name: attachment.name,
        attachment_type: attachment.type,
        attachment_size: attachment.size,
      });
      if (error) toast.error("Failed to send");
    }
  };

  const handleSendChannelMessage = async () => {
    const text = input.trim();
    const hasAttachment = !!pendingAttachment;
    
    if (!hasAttachment) {
      const validation = validateMessage(text);
      if (!validation.valid) { if (validation.error) toast.error(validation.error); return; }
    }
    if (!user || !currentChannelId) return;

    stopTyping();

    // Handle attachment
    if (pendingAttachment) {
      const attachment = await uploadAttachment(pendingAttachment.file);
      URL.revokeObjectURL(pendingAttachment.url);
      setPendingAttachment(null);
      if (attachment) {
        await sendMessageWithAttachment(text || `📎 ${attachment.name}`, attachment);
      }
      setInput("");
      setReplyTo(null);
      return;
    }

    // Optimistic update
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

    const { error } = await supabase.from("chat_messages").insert({
      channel_id: currentChannelId,
      user_id: user.id,
      user_email: user.email || "",
      user_name: userName,
      content: text,
      reply_to_id: replyTo?.id || null
    });

    if (error) {
      setChannelMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error("Failed to send message.");
    }
  };

  const handleSendDirectMessage = async () => {
    const text = input.trim();
    const hasAttachment = !!pendingAttachment;
    
    if (!hasAttachment) {
      const validation = validateMessage(text);
      if (!validation.valid) { if (validation.error) toast.error(validation.error); return; }
    }
    if (!user || !currentDMUserId) return;

    stopTyping();

    // Handle attachment
    if (pendingAttachment) {
      const attachment = await uploadAttachment(pendingAttachment.file);
      URL.revokeObjectURL(pendingAttachment.url);
      setPendingAttachment(null);
      if (attachment) {
        await sendMessageWithAttachment(text || `📎 ${attachment.name}`, attachment);
      }
      setInput("");
      setReplyTo(null);
      return;
    }

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

    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: currentDMUserId,
      content: text,
      reply_to_id: replyTo?.id || null
    });

    if (error) {
      setDirectMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error("Failed to send message.");
    }
  };

  const handleSendMessage = () => {
    playSentSound();
    if (view === "dm") handleSendDirectMessage();
    else handleSendChannelMessage();
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
    markChannelRead(channelId);
  };

  const handleSelectContact = (userId: string) => {
    setCurrentDMUserId(userId);
    setCurrentChannelId("");
    setDirectMessages([]);
    setTypingUsers([]);
    setReplyTo(null);
    setSearchQuery("");
    setShowSearch(false);
    setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, unreadCount: 0 } : u));
    setView("dm");
  };

  const handleReaction = async (messageId: string, emoji: string, messageType: 'channel' | 'direct') => {
    if (!user) return;
    const existingReaction = reactions[messageId]?.find(r => r.user_id === user.id && r.emoji === emoji);
    if (existingReaction) {
      await supabase.from("message_reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, message_type: messageType, user_id: user.id, user_email: user.email || "", emoji });
    }
  };

  const handleEditMessage = async (messageId: string, isChannel: boolean) => {
    if (!editContent.trim()) return;
    const table = isChannel ? "chat_messages" : "direct_messages";
    const { error } = await supabase.from(table).update({ content: editContent.trim(), edited_at: new Date().toISOString() }).eq("id", messageId);
    if (error) { toast.error("Failed to edit message"); return; }
    setEditingMessageId(null);
    setEditContent("");
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    return email.split("@")[0].slice(0, 2).toUpperCase();
  };

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getDisplayName = (userId: string) => {
    const profile = profiles[userId];
    return profile?.full_name || profile?.email?.split("@")[0] || "User";
  };

  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    if (view === "dm") return directMessages.find(m => m.id === replyToId);
    return channelMessages.find(m => m.id === replyToId);
  };

  const renderReadReceipt = (msg: DirectMessage) => {
    if (!user || msg.sender_id !== user.id) return null;
    if (msg.read_at) {
      return (
        <Tooltip>
          <TooltipTrigger asChild><CheckCheck className="h-3 w-3 text-blue-400 inline-block ml-1" /></TooltipTrigger>
          <TooltipContent>Read {formatDistanceToNow(new Date(msg.read_at), { addSuffix: true })}</TooltipContent>
        </Tooltip>
      );
    }
    return <Check className="h-3 w-3 text-slate-400 inline-block ml-1" />;
  };

  // Render attachment in message
  const renderAttachment = (msg: ChannelMessage | DirectMessage) => {
    const attachmentUrl = msg.attachment_url;
    const attachmentName = msg.attachment_name;
    const attachmentType = msg.attachment_type;
    const attachmentSize = msg.attachment_size;
    
    if (!attachmentUrl) return null;

    const isImage = attachmentType?.startsWith('image/');
    const isAudio = attachmentType?.startsWith('audio/');

    if (isImage) {
      return (
        <div className="mt-2 rounded-lg overflow-hidden max-w-[200px]">
          <img src={attachmentUrl} alt={attachmentName || 'Image'} className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(attachmentUrl, '_blank')} />
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="mt-2">
          <audio controls className="max-w-full h-8" preload="metadata">
            <source src={attachmentUrl} type={attachmentType || 'audio/webm'} />
          </audio>
        </div>
      );
    }

    return (
      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs">
        <File className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{attachmentName || 'File'}</span>
        {attachmentSize && <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachmentSize)}</span>}
        <Download className="h-3 w-3 shrink-0" />
      </a>
    );
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
              <button onClick={() => handleReaction(messageId, emoji, messageType)}
                className={cn("text-xs px-1.5 py-0.5 rounded-full border transition-all",
                  data.hasOwn ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >{emoji} {data.count}</button>
            </TooltipTrigger>
            <TooltipContent>{data.users.join(', ')}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  };

  const currentChannel = channels.find(ch => ch.id === currentChannelId);
  const currentDMUser = onlineUsers.find(u => u.id === currentDMUserId);

  const filteredChannelMessages = useMemo(() => 
    searchQuery ? channelMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : channelMessages,
    [channelMessages, searchQuery]
  );

  const filteredDirectMessages = useMemo(() =>
    searchQuery ? directMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : directMessages,
    [directMessages, searchQuery]
  );

  const totalChannelUnread = useMemo(() => Object.values(channelUnreadCounts).reduce((sum, c) => sum + c, 0), [channelUnreadCounts]);
  const totalUnreadCount = unreadCount + totalChannelUnread;

  const filteredContacts = useMemo(() =>
    contactSearch
      ? onlineUsers.filter(u => u.name.toLowerCase().includes(contactSearch.toLowerCase()) || u.email.toLowerCase().includes(contactSearch.toLowerCase()))
      : onlineUsers,
    [onlineUsers, contactSearch]
  );

  const groupedChannelMessages = useMemo(() => groupMessagesByDate(filteredChannelMessages), [filteredChannelMessages, groupMessagesByDate]);
  const groupedDirectMessages = useMemo(() => groupMessagesByDate(filteredDirectMessages), [filteredDirectMessages, groupMessagesByDate]);

  // Render contacts/channels sidebar (shared between mobile stacked view and desktop side-by-side)
  const renderContactsSidebar = () => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} className="h-9 pl-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          {/* Channels section */}
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-1.5">Channels</p>
          {channels
            .filter(ch => !ch.name.toLowerCase().startsWith('dm-'))
            .filter(ch => !contactSearch || ch.name.toLowerCase().includes(contactSearch.toLowerCase()))
            .map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleSelectChannel(ch.id)}
              className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all",
                "hover:bg-white dark:hover:bg-slate-800 group",
                "border border-transparent hover:border-slate-200 dark:hover:border-slate-700",
                currentChannelId === ch.id && view === "chat" && "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Hash className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{ch.name}</p>
              </div>
              {(channelUnreadCounts[ch.id] || 0) > 0 && (
                <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs px-2 py-0.5">{channelUnreadCounts[ch.id]}</Badge>
              )}
            </button>
          ))}

          {/* Team Members section */}
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-1.5 mt-2">Team Members</p>
          {filteredContacts.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-4">No contacts found</p>
          ) : (
            filteredContacts.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectContact(u.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all",
                  "hover:bg-white dark:hover:bg-slate-800 group",
                  "border border-transparent hover:border-slate-200 dark:hover:border-slate-700",
                  currentDMUserId === u.id && view === "dm" && "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="relative">
                  <Avatar className="h-8 w-8 border-2 border-slate-200 dark:border-slate-700">
                    <AvatarImage src={u.avatarUrl || undefined} />
                    <AvatarFallback className={cn(getAvatarColor(u.email || u.name), "text-white text-xs font-medium")}>{getInitials(u.name, u.email)}</AvatarFallback>
                  </Avatar>
                  <span className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-50 dark:border-slate-900", u.isOnline ? "bg-emerald-500" : "bg-slate-400")} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{u.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {u.isOnline ? "Online" : u.lastSeen ? `Active ${formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}` : "Offline"}
                  </p>
                </div>
                {(u.unreadCount || 0) > 0 && (
                  <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs px-2 py-0.5">{u.unreadCount}</Badge>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );


  // Swipe-to-reply handler for touch devices
  const swipeRef = useRef<{ startX: number; startY: number; msgId: string; swiping: boolean } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: ChannelMessage | DirectMessage) => {
    const touch = e.touches[0];
    swipeRef.current = { startX: touch.clientX, startY: touch.clientY, msgId: msg.id, swiping: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent, element: HTMLElement | null) => {
    if (!swipeRef.current || !element) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeRef.current.startX;
    const deltaY = Math.abs(touch.clientY - swipeRef.current.startY);

    // Only register as swipe if horizontal movement > vertical movement
    if (deltaY > 30 && !swipeRef.current.swiping) {
      swipeRef.current = null;
      return;
    }

    if (deltaX > 10) {
      swipeRef.current.swiping = true;
      const translateX = Math.min(deltaX * 0.5, 60);
      element.style.transform = `translateX(${translateX}px)`;
      element.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, element: HTMLElement | null, msg: ChannelMessage | DirectMessage) => {
    if (!swipeRef.current || !element) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeRef.current.startX;

    element.style.transform = '';
    element.style.transition = 'transform 0.2s ease-out';

    if (swipeRef.current.swiping && deltaX > 50) {
      setReplyTo(msg);
    }

    swipeRef.current = null;
  }, []);

  // Render a message bubble (shared between channel and DM views)
  const renderMessageBubble = (msg: ChannelMessage | DirectMessage, isChannel: boolean) => {
    const isOwn = isChannel ? (msg as ChannelMessage).user_id === user.id : (msg as DirectMessage).sender_id === user.id;
    const senderId = isChannel ? (msg as ChannelMessage).user_id : (msg as DirectMessage).sender_id;
    const profile = profiles[senderId];
    const displayName = isChannel
      ? (profile?.full_name || (msg as ChannelMessage).user_name || (msg as ChannelMessage).user_email.split("@")[0])
      : (profile?.full_name || profile?.email?.split("@")[0] || "User");
    const email = isChannel ? (msg as ChannelMessage).user_email : (profile?.email || "");
    const replyMessage = getReplyMessage(msg.reply_to_id);
    const replySourceName = replyMessage
      ? (isChannel
          ? (profiles[(replyMessage as ChannelMessage).user_id]?.full_name || (replyMessage as ChannelMessage).user_name)
          : getDisplayName((replyMessage as DirectMessage).sender_id))
      : null;

    return (
      <div key={msg.id} className={cn("flex gap-2 min-w-0 overflow-hidden", isOwn ? "justify-end" : "justify-start")}>
        {/* Swipe reply indicator (shown on left during swipe) */}
        <div className="flex items-center shrink-0 opacity-30 pointer-events-none">
          <Reply className="h-4 w-4 text-blue-500" />
        </div>
        {!isOwn && (
          <button type="button" onClick={() => setProfileModalUserId(senderId)} className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
            <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className={cn(getAvatarColor(email || displayName), "text-white text-xs")}>{getInitials(displayName, email)}</AvatarFallback>
            </Avatar>
          </button>
        )}
        <div
          className="max-w-[75%] min-w-0 overflow-hidden"
          onTouchStart={(e) => handleTouchStart(e, msg)}
          onTouchMove={(e) => handleTouchMove(e, e.currentTarget)}
          onTouchEnd={(e) => handleTouchEnd(e, e.currentTarget, msg)}
        >
          {replyMessage && (
            <button
              type="button"
              className={cn(
                "text-xs px-2 py-1 mb-1 rounded-md border-l-2 border-blue-400 bg-slate-100 dark:bg-slate-800 w-full text-left cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors",
                isOwn && "ml-auto"
              )}
              onClick={() => {
                // Scroll to the original message
                const replyEl = document.getElementById(`msg-${replyMessage.id}`);
                if (replyEl) {
                  replyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  replyEl.classList.add('ring-2', 'ring-blue-400', 'ring-opacity-75');
                  setTimeout(() => replyEl.classList.remove('ring-2', 'ring-blue-400', 'ring-opacity-75'), 2000);
                }
              }}
            >
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {replySourceName}
              </span>
              <p className="text-slate-500 truncate">{replyMessage.content}</p>
            </button>
          )}
          <div
            id={`msg-${msg.id}`}
            className={cn(
              "p-3 rounded-2xl group relative break-words overflow-hidden transition-all duration-300",
              isOwn ? "bg-blue-600 text-white rounded-br-md" : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md shadow-sm border border-slate-200 dark:border-slate-700"
            )}
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            onDoubleClick={() => setReplyTo(msg)}
          >
            {!isOwn && (
              <button type="button" onClick={() => setProfileModalUserId(senderId)} className="text-xs font-semibold mb-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer block">
                {displayName}
              </button>
            )}
            {editingMessageId === msg.id ? (
              <div className="space-y-2">
                <Input value={editContent} onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditMessage(msg.id, isChannel); if (e.key === "Escape") setEditingMessageId(null); }}
                  className="h-7 text-sm" autoFocus
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs" onClick={() => handleEditMessage(msg.id, isChannel)}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingMessageId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
            )}
            {renderAttachment(msg)}
            <div className="flex items-center gap-1 mt-1.5">
              <span className={cn("text-[10px]", isOwn ? "text-blue-200" : "text-slate-400")}>{formatTime(msg.created_at)}</span>
              {msg.edited_at && <span className="text-[10px] text-slate-400">(edited)</span>}
              {!isChannel && renderReadReceipt(msg as DirectMessage)}
            </div>
            {renderReactions(msg.id, isChannel ? 'channel' : 'direct')}

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
                      <button key={emoji} onClick={() => handleReaction(msg.id, emoji, isChannel ? 'channel' : 'direct')} className="text-lg hover:scale-125 transition-transform p-1">{emoji}</button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <button onClick={() => setReplyTo(msg)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors" title="Reply">
                <Reply className="h-3.5 w-3.5 text-slate-500" />
              </button>
              {isOwn && (
                <button onClick={() => { setEditingMessageId(msg.id); setEditContent(msg.content); }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors" title="Edit">
                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render input area (shared between channel and DM views)
  const renderInputArea = () => (
    <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      {/* Pending attachment preview */}
      {pendingAttachment && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
          {pendingAttachment.file.type.startsWith('image/') ? (
            <img src={pendingAttachment.url} alt="" className="h-12 w-12 rounded object-cover" />
          ) : (
            <File className="h-8 w-8 text-slate-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{pendingAttachment.file.name}</p>
            <p className="text-[10px] text-slate-500">{formatFileSize(pendingAttachment.file.size)}</p>
          </div>
          <button onClick={() => { URL.revokeObjectURL(pendingAttachment.url); setPendingAttachment(null); }} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">Recording {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
          <div className="ml-auto flex gap-1">
            <button onClick={cancelRecording} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors" title="Cancel">
              <X className="h-4 w-4 text-red-500" />
            </button>
            <button onClick={stopRecording} className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors" title="Stop & Send">
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 items-end">
        {/* Emoji picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0" title="Emoji">
              <Smile className="h-5 w-5 text-slate-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start" side="top">
            <div className="max-h-64 overflow-y-auto">
              {EMOJI_CATEGORIES.map(cat => (
                <div key={cat.label} className="p-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 px-1">{cat.label}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {cat.emojis.map(emoji => (
                      <button key={emoji} onClick={() => setInput(prev => prev + emoji)} className="text-lg hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all p-1 rounded">{emoji}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Attachment button */}
        <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0" title="Attach file">
          <Paperclip className="h-5 w-5 text-slate-500" />
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />

        {/* Voice note button */}
        {!isRecording && (
          <button onClick={startRecording} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0" title="Voice note">
            <Mic className="h-5 w-5 text-slate-500" />
          </button>
        )}

        <div className="flex-1 relative">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => { setInput(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
            className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-blue-500"
            disabled={isRecording}
          />
        </div>
        <Button size="icon" onClick={handleSendMessage} className="bg-blue-600 hover:bg-blue-700 shrink-0" disabled={!input.trim() && !pendingAttachment}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Render messages list (shared)
  const renderMessagesList = (messages: { date: string; messages: (ChannelMessage | DirectMessage)[] }[], isChannel: boolean) => (
    <>
      {/* Sticky date header */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-20 flex justify-center py-2 transition-all duration-200",
        showStickyDate && stickyDate ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      )}>
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium px-3 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full shadow-sm border border-slate-200 dark:border-slate-700">{stickyDate}</span>
      </div>
      
      <ScrollArea className="flex-1 px-3 py-2 overflow-hidden [&>div[style]]:!overflow-x-hidden" viewportRef={scrollViewportRef} onScrollChange={handleScroll}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="space-y-4 min-w-0 overflow-hidden">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">{searchQuery ? "No messages found" : "No messages yet"}</p>
                <p className="text-slate-400 text-xs mt-1">{isChannel ? "Start the conversation!" : "Say hello!"}</p>
              </div>
            ) : (
              messages.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-2 my-3" data-date-separator={group.date}>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs text-slate-500 font-medium px-2">{group.date}</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="space-y-2 min-w-0 overflow-hidden">
                    {group.messages.map((msg) => renderMessageBubble(msg, isChannel))}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Scroll to bottom button */}
      <div className={cn(
        "absolute bottom-24 left-1/2 -translate-x-1/2 transition-all duration-200 z-10",
        showScrollButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}>
        <button onClick={() => scrollToBottom()} className={cn(
          "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-lg border border-slate-200 dark:border-slate-700",
          "p-2.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 hover:scale-110 active:scale-95 transition-all duration-150 flex items-center justify-center"
        )} aria-label="Scroll to bottom">
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
          <span>{typingUsers.length === 1 ? `${typingUsers[0].name} is typing...` : `${typingUsers.length} people are typing...`}</span>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900">
          <div className="w-1 h-8 bg-blue-500 rounded-full" />
          <Reply className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
              Replying to {isChannel 
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

      {renderInputArea()}
    </>
  );

  return (
    <TooltipProvider>
      {/* Mobile: Floating circle button / Desktop: Messenger-style bar */}
      {!isOpen && (
        isMobile ? (
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              "fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center",
              "bg-slate-800 dark:bg-slate-700 text-white shadow-xl hover:shadow-2xl",
              "hover:scale-105 transition-all duration-200 ease-out",
              "border border-slate-600"
            )}
          >
            <MessageCircle className="h-6 w-6" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-medium w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              "fixed bottom-0 right-6 z-50 w-[328px] h-12 rounded-t-xl flex items-center gap-3 px-4",
              "bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800",
              "text-white shadow-xl hover:shadow-2xl transition-all duration-200 ease-out",
              "border border-b-0 border-slate-600"
            )}
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-sm">Messaging</span>
            {totalUnreadCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-medium min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
              </span>
            )}
          </button>
        )
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden",
            "shadow-2xl border border-slate-200 dark:border-slate-700",
            "bg-white dark:bg-slate-900 transition-all duration-300 ease-out",
            "animate-in slide-in-from-bottom-4 fade-in-0",
            isMobile
              ? "bottom-16 right-2 left-2 top-16 rounded-xl"
              : "bottom-0 right-6 w-[700px] h-[520px] rounded-t-xl border-b-0"
          )}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center justify-between px-4 py-3",
            "bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800",
            "text-white border-b border-slate-600"
          )}>
            <div className="flex items-center gap-2">
              {/* Mobile: back button when in chat */}
              {isMobile && (view === "chat" || view === "dm") && (
                <button onClick={() => setView("contacts")} className="hover:bg-white/10 p-1.5 rounded-lg transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <h3 className="font-semibold text-sm">
                  {isMobile ? (
                    <>
                      {view === "contacts" && "Messages"}
                      {view === "chat" && `# ${currentChannel?.name || "Chat"}`}
                      {view === "dm" && (currentDMUser?.name || "Direct Message")}
                    </>
                  ) : (
                    "Messages"
                  )}
                </h3>
                {isMobile && view === "dm" && currentDMUser && (
                  <span className="text-xs text-slate-300 flex items-center gap-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full", currentDMUser.isOnline ? "bg-emerald-400" : "bg-slate-500")} />
                    {currentDMUser.isOnline 
                      ? "Online" 
                      : currentDMUser.lastSeen 
                        ? `Last seen ${formatDistanceToNow(new Date(currentDMUser.lastSeen), { addSuffix: true })}`
                        : "Offline"
                    }
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {!isConnected && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs", isReconnecting ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300")}>
                      {isReconnecting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <WifiOff className="h-3 w-3" />}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{isReconnecting ? "Reconnecting..." : "Connection lost"}</TooltipContent>
                </Tooltip>
              )}
              {isSupported && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={async () => {
                      if (permissionStatus !== 'granted') {
                        const granted = await requestPermission();
                        toast[granted ? 'success' : 'error'](granted ? "Push notifications enabled" : "Notifications blocked by browser");
                      } else {
                        toggleNotifications();
                        toast.info(notificationsEnabled ? "Notifications muted" : "Notifications unmuted");
                      }
                    }} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                      {permissionStatus === 'granted' && notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 opacity-60" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {permissionStatus !== 'granted' ? (permissionStatus === 'denied' ? "Notifications blocked" : "Enable notifications") : (notificationsEnabled ? "Mute notifications" : "Unmute notifications")}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={toggleSound} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-60" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{soundEnabled ? "Mute sounds" : "Unmute sounds"}</TooltipContent>
              </Tooltip>
              {(view === "chat" || view === "dm") && (
                <button onClick={() => setShowSearch(!showSearch)} className={cn("hover:bg-white/10 p-2 rounded-lg transition-colors", showSearch && "bg-white/10")}>
                  <Search className="h-4 w-4" />
                </button>
              )}
              {!isMobile && (
                <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-lg transition-colors" title="Minimize">
                  <Minus className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-lg transition-colors" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (view === "chat" || view === "dm") && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search messages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 pl-9 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" autoFocus />
              </div>
            </div>
          )}

          {/* Content - Slack-style on desktop, stacked on mobile */}
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900 relative">
            {isMobile ? (
              <>
                {/* Mobile: stacked views as before */}
                {view === "contacts" && renderContactsSidebar()}
                {view === "chat" && (
                  <div className="flex-1 flex flex-col overflow-hidden relative">
                    {renderMessagesList(groupedChannelMessages, true)}
                  </div>
                )}
                {view === "dm" && (
                  <div className="flex-1 flex flex-col overflow-hidden relative">
                    {renderMessagesList(groupedDirectMessages, false)}
                  </div>
                )}
              </>
            ) : (
              /* Desktop: Slack-style side-by-side layout */
              <div className="flex flex-1 overflow-hidden">
                {/* Left sidebar - contacts/channels */}
                <div className="w-[240px] border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden shrink-0">
                  {renderContactsSidebar()}
                </div>
                {/* Right pane - active chat */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {(view === "chat" || view === "dm") ? (
                    <>
                      {/* Chat header bar */}
                      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex items-center gap-2 shrink-0">
                        {view === "chat" && (
                          <>
                            <Hash className="h-4 w-4 text-slate-500" />
                            <span className="font-semibold text-sm text-foreground">{currentChannel?.name || "Chat"}</span>
                          </>
                        )}
                        {view === "dm" && currentDMUser && (
                          <>
                            <div className="relative">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={currentDMUser.avatarUrl || undefined} />
                                <AvatarFallback className={cn(getAvatarColor(currentDMUser.email || currentDMUser.name), "text-white text-[10px]")}>{getInitials(currentDMUser.name, currentDMUser.email)}</AvatarFallback>
                              </Avatar>
                              <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800", currentDMUser.isOnline ? "bg-emerald-500" : "bg-slate-400")} />
                            </div>
                            <div>
                              <span className="font-semibold text-sm text-foreground">{currentDMUser.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {currentDMUser.isOnline 
                                  ? "Online" 
                                  : currentDMUser.lastSeen 
                                    ? `Active ${formatDistanceToNow(new Date(currentDMUser.lastSeen), { addSuffix: true })}`
                                    : "Offline"
                                }
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      {view === "chat" 
                        ? renderMessagesList(groupedChannelMessages, true)
                        : renderMessagesList(groupedDirectMessages, false)
                      }
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      <div className="text-center space-y-2">
                        <MessageCircle className="h-10 w-10 mx-auto opacity-30" />
                        <p>Select a conversation</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <UserProfileModal
        open={!!profileModalUserId}
        onOpenChange={(open) => { if (!open) setProfileModalUserId(null); }}
        userId={profileModalUserId || undefined}
      />
    </TooltipProvider>
  );
};

export default FloatingChat;
