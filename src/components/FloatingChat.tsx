import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MessageCircle, X, Send, Hash, ChevronLeft, Search, Bell, BellOff,
  ArrowDown, WifiOff, RefreshCw, Volume2, VolumeX, Minus, Gamepad2, Sparkles
} from "lucide-react";
import { AIChatPanel } from "@/components/chat/AIChatPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useConnectionStatus, useTypingIndicator, validateMessage } from "@/hooks/useChatUtils";
import { useChatSounds } from "@/hooks/useChatSounds";
import { isEmailAllowed } from "@/types/opportunity";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { UserProfileModal } from "@/components/UserProfileModal";

import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import {
  DirectMessage, ChannelMessage, Channel, Profile, OnlineUser, TypingUser,
  Reaction, ChatView, getAvatarColor, getInitials
} from "@/components/chat/types";

const SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000';

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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [chatWidth, setChatWidth] = useState(740);
  const [chatHeight, setChatHeight] = useState(540);
  const isResizingRef = useRef<'top' | 'left' | 'topleft' | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 740, h: 540 });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalPresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSeenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobile();
  const userName = teamMemberName || user?.email?.split("@")[0] || "";

  const { isConnected, isReconnecting, handleConnectionChange } = useConnectionStatus();
  const { startTyping, stopTyping } = useTypingIndicator(presenceChannelRef, userName);
  const { requestPermission, toggleNotifications, notificationsEnabled, isSupported, permissionStatus } = useChatNotifications({ isChatOpen: isOpen, currentChannelId, currentDMUserId });
  const { soundEnabled, toggleSound, playMessageSound, playSentSound } = useChatSounds();
  const { isThinking, isAIChannel, isAIBotMessage, triggerAIResponse } = useAIAssistant();

  const viewRef = useRef(view);
  const currentDMUserIdRef = useRef(currentDMUserId);
  const currentChannelIdRef = useRef(currentChannelId);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { currentDMUserIdRef.current = currentDMUserId; }, [currentDMUserId]);
  useEffect(() => { currentChannelIdRef.current = currentChannelId; }, [currentChannelId]);
  // ── Resize handlers ──
  const handleResizeMouseDown = useCallback((edge: 'top' | 'left' | 'topleft') => (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = edge;
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: chatWidth, h: chatHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      const dir = isResizingRef.current;
      if (!dir) return;
      const dx = resizeStartRef.current.x - ev.clientX;
      const dy = resizeStartRef.current.y - ev.clientY;
      if (dir === 'left' || dir === 'topleft') {
        setChatWidth(Math.max(500, Math.min(1200, resizeStartRef.current.w + dx)));
      }
      if (dir === 'top' || dir === 'topleft') {
        setChatHeight(Math.max(360, Math.min(900, resizeStartRef.current.h + dy)));
      }
    };
    const handleMouseUp = () => {
      isResizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [chatWidth, chatHeight]);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('openFloatingChat', handleOpenChat);
    return () => window.removeEventListener('openFloatingChat', handleOpenChat);
  }, []);

  // Auto-open chat when on /chat route
  useEffect(() => {
    if (window.location.pathname === "/chat") {
      setIsOpen(true);
    }
  }, []);

  // Notify dock of open/close state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(isOpen ? "dockAppOpened" : "dockAppClosed"));
  }, [isOpen]);

  const formatMessageDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  }, []);

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

  const stickyDateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom);
    // Throttle date separator queries to avoid layout thrashing
    if (stickyDateTimeoutRef.current) return;
    stickyDateTimeoutRef.current = setTimeout(() => {
      stickyDateTimeoutRef.current = null;
      const dateSeparators = target.querySelectorAll('[data-date-separator]');
      let currentDate: string | null = null;
      dateSeparators.forEach((separator) => {
        const rect = separator.getBoundingClientRect();
        const containerRect = target.getBoundingClientRect();
        if (rect.top <= containerRect.top + 50) currentDate = separator.getAttribute('data-date-separator');
      });
      setStickyDate(currentDate);
      setShowStickyDate(target.scrollTop > 50 && currentDate !== null);
    }, 100);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      if (smooth) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      else viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const updateLastSeen = async () => { await supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id); };
    updateLastSeen();
    lastSeenIntervalRef.current = setInterval(updateLastSeen, 15000);
    return () => { if (lastSeenIntervalRef.current) clearInterval(lastSeenIntervalRef.current); };
  }, [user]);

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
        return { id: p.id, name: p.full_name || p.email?.split("@")[0] || "User", email: p.email || "", avatarUrl: p.avatar_url, isOnline, unreadCount: 0, lastSeen: p.last_seen };
      });
    setOnlineUsers(users);
  }, [user?.id]);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from("direct_messages").select("sender_id").eq("receiver_id", user.id).is("read_at", null).neq("sender_id", SYSTEM_SENDER_ID);
    if (error) { console.error("Failed to fetch unread counts:", error); return; }
    const counts: Record<string, number> = {};
    (data || []).forEach(msg => { counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1; });
    setOnlineUsers(prev => prev.map(u => ({ ...u, unreadCount: counts[u.id] || 0 })));
    setUnreadCount((data || []).length);
  }, [user]);

  const getChannelLastRead = useCallback((): Record<string, string> => {
    if (!user) return {};
    try { const stored = localStorage.getItem(`chat_last_read_${user.id}`); return stored ? JSON.parse(stored) : {}; } catch { return {}; }
  }, [user]);

  const markChannelRead = useCallback((channelId: string) => {
    if (!user) return;
    const timestamps = getChannelLastRead();
    timestamps[channelId] = new Date().toISOString();
    localStorage.setItem(`chat_last_read_${user.id}`, JSON.stringify(timestamps));
    setChannelUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
  }, [user, getChannelLastRead]);

  const fetchChannelUnreadCounts = useCallback(async () => {
    if (!user || channels.length === 0) return;
    const lastReadTimestamps = getChannelLastRead();
    const counts: Record<string, number> = {};
    const channelIds = channels.map(ch => ch.id);
    const { data, error } = await supabase.from("chat_messages").select("channel_id").in("channel_id", channelIds).neq("user_id", user.id);
    if (error || !data) return;
    data.forEach(msg => { const lastRead = lastReadTimestamps[msg.channel_id]; if (!lastRead) counts[msg.channel_id] = (counts[msg.channel_id] || 0) + 1; });
    const channelsWithLastRead = channels.filter(ch => lastReadTimestamps[ch.id]);
    if (channelsWithLastRead.length > 0) {
      for (const ch of channelsWithLastRead) {
        const { count } = await supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("channel_id", ch.id).neq("user_id", user.id).gt("created_at", lastReadTimestamps[ch.id]);
        counts[ch.id] = count || 0;
      }
    }
    setChannelUnreadCounts(counts);
  }, [user, channels, getChannelLastRead]);

  const fetchChannels = useCallback(async () => {
    const { data, error } = await supabase.from("chat_channels").select("*").order("created_at", { ascending: true });
    if (error) { console.error("Failed to load channels:", error); return; }
    setChannels(data || []);
  }, []);

  const fetchChannelMessages = useCallback(async () => {
    if (!currentChannelId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("channel_id", currentChannelId).order("created_at", { ascending: true });
      if (error) { console.error("Failed to load messages:", error); return; }
      setChannelMessages(data || []);
      fetchReactions((data || []).map(m => m.id), 'channel');
    } finally { setIsLoading(false); }
  }, [currentChannelId]);

  const fetchDirectMessages = useCallback(async () => {
    if (!currentDMUserId || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("direct_messages").select("*")
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
    } finally { setIsLoading(false); }
  }, [currentDMUserId, user, fetchUnreadCounts]);

  const fetchReactions = async (messageIds: string[], messageType: 'channel' | 'direct') => {
    if (messageIds.length === 0) return;
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", messageIds).eq("message_type", messageType);
    if (data) {
      const grouped: Record<string, Reaction[]> = {};
      data.forEach(r => { if (!grouped[r.message_id]) grouped[r.message_id] = []; grouped[r.message_id].push(r as Reaction); });
      setReactions(prev => ({ ...prev, ...grouped }));
    }
  };

  useEffect(() => {
    if (user) {
      fetchProfiles(); fetchChannels(); fetchUnreadCounts();
      supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("receiver_id", user.id).eq("sender_id", SYSTEM_SENDER_ID).is("read_at", null).then();
    }
  }, [user, fetchProfiles, fetchChannels, fetchUnreadCounts]);

  useEffect(() => { if (channels.length > 0) fetchChannelUnreadCounts(); }, [channels, fetchChannelUnreadCounts]);

  // Refresh online status periodically instead of subscribing to every profile UPDATE
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => { fetchProfiles(); }, 30000);
    return () => clearInterval(interval);
  }, [user, fetchProfiles]);

  useEffect(() => { if (currentChannelId && view === "chat") fetchChannelMessages(); }, [currentChannelId, view, fetchChannelMessages]);
  useEffect(() => { if (currentDMUserId && view === "dm") fetchDirectMessages(); }, [currentDMUserId, view, fetchDirectMessages]);

  useEffect(() => {
    const timer = setTimeout(() => { if (isNearBottom) scrollToBottom(false); }, 50);
    return () => clearTimeout(timer);
  }, [channelMessages.length, directMessages.length, isNearBottom, scrollToBottom]);

  useEffect(() => {
    if ((view === "chat" && currentChannelId) || (view === "dm" && currentDMUserId)) {
      const timer = setTimeout(() => { scrollToBottom(false); setIsNearBottom(true); setShowScrollButton(false); }, 100);
      return () => clearTimeout(timer);
    }
  }, [view, currentChannelId, currentDMUserId, scrollToBottom]);

  useEffect(() => {
    if (!user) return;
    const globalChannel = supabase.channel("global-presence", { config: { presence: { key: user.id } } });
    globalChannel.on("presence", { event: "sync" }, () => {
      const state = globalChannel.presenceState();
      const presenceOnlineIds = new Set(Object.keys(state));
      setOnlineUsers(prev => prev.map(u => {
        const isPresenceOnline = presenceOnlineIds.has(u.id);
        const lastSeenRecent = u.lastSeen ? (Date.now() - new Date(u.lastSeen).getTime()) < 120000 : false;
        return { ...u, isOnline: isPresenceOnline || lastSeenRecent, lastSeen: isPresenceOnline ? new Date().toISOString() : u.lastSeen };
      }));
    }).subscribe(async (status) => { if (status === "SUBSCRIBED") await globalChannel.track({ name: userName, email: user.email, online_at: new Date().toISOString() }); });
    globalPresenceRef.current = globalChannel;
    return () => { supabase.removeChannel(globalChannel); globalPresenceRef.current = null; };
  }, [user, userName]);

  useEffect(() => {
    if (!currentChannelId || view !== "chat") return;
    const channel = supabase.channel(`chat-messages-${currentChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` }, (payload) => {
        const newMsg = payload.new as ChannelMessage;
        setChannelMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.user_id === newMsg.user_id));
          return [...filtered, newMsg];
        });
        if (newMsg.user_id !== user?.id) playMessageSound();
        markChannelRead(currentChannelId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` }, (payload) => {
        const updated = payload.new as ChannelMessage;
        setChannelMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${currentChannelId}` }, (payload) => {
        const deleted = payload.old as { id: string };
        setChannelMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentChannelId, view, user?.id, playMessageSound, markChannelRead]);

  useEffect(() => {
    if (!user) return;
    const allChannelMsgs = supabase.channel('all-channel-msgs-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as ChannelMessage;
        if (msg.user_id === user.id) return;
        if (viewRef.current === 'chat' && msg.channel_id === currentChannelIdRef.current) return;
        setChannelUnreadCounts(prev => ({ ...prev, [msg.channel_id]: (prev[msg.channel_id] || 0) + 1 }));
      }).subscribe();
    return () => { supabase.removeChannel(allChannelMsgs); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handleDMEvent = (payload: { eventType: string; new: unknown; old: unknown }) => {
      const newMsg = payload.new as DirectMessage;
      if (newMsg.sender_id !== user.id && newMsg.receiver_id !== user.id) return;
      const currentView = viewRef.current;
      const currentDM = currentDMUserIdRef.current;
      if (currentView === "dm" && currentDM) {
        const isPartOfConversation = (newMsg.sender_id === user.id && newMsg.receiver_id === currentDM) || (newMsg.sender_id === currentDM && newMsg.receiver_id === user.id);
        if (isPartOfConversation) {
          if (payload.eventType === 'INSERT') {
            if (newMsg.sender_id !== user.id) {
              playMessageSound();
              supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id).then(() => { fetchUnreadCounts(); });
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
    const dmReceivedChannel = supabase.channel(`dm-received-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${user.id}` }, handleDMEvent).subscribe();
    const dmSentChannel = supabase.channel(`dm-sent-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, handleDMEvent).subscribe();
    return () => { supabase.removeChannel(dmReceivedChannel); supabase.removeChannel(dmSentChannel); };
  }, [user, playMessageSound]);

  useEffect(() => {
    const channel = supabase.channel('reactions-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
      if (payload.eventType === 'INSERT') { const r = payload.new as Reaction; setReactions(prev => ({ ...prev, [r.message_id]: [...(prev[r.message_id] || []), r] })); }
      else if (payload.eventType === 'DELETE') { const r = payload.old as Reaction; setReactions(prev => ({ ...prev, [r.message_id]: (prev[r.message_id] || []).filter(x => x.id !== r.id) })); }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!currentChannelId || !user || view !== "chat") return;
    const presenceChannel = supabase.channel(`typing-${currentChannelId}`, { config: { presence: { key: user.id } } });
    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const typing: TypingUser[] = [];
      Object.entries(state).forEach(([userId, presences]) => {
        const presence = presences[0] as { typing?: boolean; name?: string };
        if (presence?.typing && userId !== user.id) typing.push({ id: userId, name: presence.name || "Someone" });
      });
      setTypingUsers(typing);
    }).subscribe(async (status) => { if (status === "SUBSCRIBED") await presenceChannel.track({ typing: false, name: userName }); });
    presenceChannelRef.current = presenceChannel;
    return () => { supabase.removeChannel(presenceChannel); presenceChannelRef.current = null; };
  }, [currentChannelId, user, userName, view]);

  useEffect(() => {
    if (!currentDMUserId || !user || view !== "dm") return;
    const conversationKey = [user.id, currentDMUserId].sort().join("-");
    const presenceChannel = supabase.channel(`dm-typing-${conversationKey}`, { config: { presence: { key: user.id } } });
    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const typing: TypingUser[] = [];
      Object.entries(state).forEach(([userId, presences]) => {
        const presence = presences[0] as { typing?: boolean; name?: string };
        if (presence?.typing && userId !== user.id) typing.push({ id: userId, name: presence.name || "Someone" });
      });
      setTypingUsers(typing);
    }).subscribe(async (status) => { if (status === "SUBSCRIBED") await presenceChannel.track({ typing: false, name: userName }); });
    presenceChannelRef.current = presenceChannel;
    return () => { supabase.removeChannel(presenceChannel); presenceChannelRef.current = null; };
  }, [currentDMUserId, user, userName, view]);

  const handleTyping = useCallback(() => { startTyping(); }, [startTyping]);

  const uploadAttachment = async (file: File) => {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${user?.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const { error } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (error) { toast.error("Failed to upload file"); return null; }
    return { url: path, name: file.name, type: file.type, size: file.size };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File size must be under 10MB"); return; }
    const url = URL.createObjectURL(file);
    setPendingAttachment({ file, url });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new window.File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setRecordingTime(0); setIsRecording(false);
        const attachment = await uploadAttachment(file);
        if (attachment) await sendMessageWithAttachment("🎙️ Voice note", attachment);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true); setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch { toast.error("Microphone access denied"); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); };
  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); mediaRecorderRef.current = null; }
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false); setRecordingTime(0); audioChunksRef.current = [];
  };

  const sendMessageWithAttachment = async (content: string, attachment: { url: string; name: string; type: string; size: number }) => {
    if (!user) return;
    if (view === "chat" && currentChannelId) {
      const { error } = await supabase.from("chat_messages").insert({ channel_id: currentChannelId, user_id: user.id, user_email: user.email || "", user_name: userName, content, attachment_url: attachment.url, attachment_name: attachment.name, attachment_type: attachment.type, attachment_size: attachment.size });
      if (error) toast.error("Failed to send");
    } else if (view === "dm" && currentDMUserId) {
      const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, receiver_id: currentDMUserId, content, attachment_url: attachment.url, attachment_name: attachment.name, attachment_type: attachment.type, attachment_size: attachment.size });
      if (error) toast.error("Failed to send");
    }
  };

  const handleSendChannelMessage = async (submittedText: string) => {
    const text = submittedText;
    const hasAttachment = !!pendingAttachment;
    if (!hasAttachment) { const v = validateMessage(text); if (!v.valid) { if (v.error) toast.error(v.error); return; } }
    if (!user || !currentChannelId) return;
    stopTyping();
    if (pendingAttachment) {
      const attachment = await uploadAttachment(pendingAttachment.file);
      URL.revokeObjectURL(pendingAttachment.url); setPendingAttachment(null);
      if (attachment) await sendMessageWithAttachment(text || `📎 ${attachment.name}`, attachment);
      setInput(""); setReplyTo(null); return;
    }
    const optimisticMessage: ChannelMessage = { id: `temp-${Date.now()}`, channel_id: currentChannelId, user_id: user.id, user_email: user.email || "", user_name: userName, content: text, created_at: new Date().toISOString(), reply_to_id: replyTo?.id || null };
    setChannelMessages(prev => [...prev, optimisticMessage]); setInput(""); setReplyTo(null);
    const { error } = await supabase.from("chat_messages").insert({ channel_id: currentChannelId, user_id: user.id, user_email: user.email || "", user_name: userName, content: text, reply_to_id: replyTo?.id || null });
    if (error) { setChannelMessages(prev => prev.filter(m => m.id !== optimisticMessage.id)); toast.error("Failed to send message."); }
    else {
      const currentChannel = channels.find(ch => ch.id === currentChannelId);
      if (currentChannel && isAIChannel(currentChannel.name)) {
        triggerAIResponse(currentChannelId, text);
      }
    }
  };

  const handleSendDirectMessage = async (submittedText: string) => {
    const text = submittedText;
    const hasAttachment = !!pendingAttachment;
    if (!hasAttachment) { const v = validateMessage(text); if (!v.valid) { if (v.error) toast.error(v.error); return; } }
    if (!user || !currentDMUserId) return;
    stopTyping();
    if (pendingAttachment) {
      const attachment = await uploadAttachment(pendingAttachment.file);
      URL.revokeObjectURL(pendingAttachment.url); setPendingAttachment(null);
      if (attachment) await sendMessageWithAttachment(text || `📎 ${attachment.name}`, attachment);
      setInput(""); setReplyTo(null); return;
    }
    const optimisticMessage: DirectMessage = { id: `temp-${Date.now()}`, sender_id: user.id, receiver_id: currentDMUserId, content: text, created_at: new Date().toISOString(), read_at: null, reply_to_id: replyTo?.id || null };
    setDirectMessages(prev => [...prev, optimisticMessage]); setInput(""); setReplyTo(null);
    const { error } = await supabase.from("direct_messages").insert({ sender_id: user.id, receiver_id: currentDMUserId, content: text, reply_to_id: replyTo?.id || null });
    if (error) { setDirectMessages(prev => prev.filter(m => m.id !== optimisticMessage.id)); toast.error("Failed to send message."); }
  };

  const handleSendMessage = (text: string) => { playSentSound(); if (view === "dm") handleSendDirectMessage(text); else handleSendChannelMessage(text); };

  const handleSelectChannel = (channelId: string) => {
    setCurrentChannelId(channelId); setCurrentDMUserId(""); setChannelMessages([]); setTypingUsers([]); setReplyTo(null); setSearchQuery(""); setShowSearch(false); setView("chat"); markChannelRead(channelId);
  };
  const handleSelectContact = (userId: string) => {
    setCurrentDMUserId(userId); setCurrentChannelId(""); setDirectMessages([]); setTypingUsers([]); setReplyTo(null); setSearchQuery(""); setShowSearch(false);
    setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, unreadCount: 0 } : u)); setView("dm");
  };

  const handleReaction = async (messageId: string, emoji: string, messageType: 'channel' | 'direct') => {
    if (!user) return;
    const existingReaction = reactions[messageId]?.find(r => r.user_id === user.id && r.emoji === emoji);
    if (existingReaction) await supabase.from("message_reactions").delete().eq("id", existingReaction.id);
    else await supabase.from("message_reactions").insert({ message_id: messageId, message_type: messageType, user_id: user.id, user_email: user.email || "", emoji });
  };

  const handleEditMessage = async (messageId: string, isChannel: boolean) => {
    if (!editContent.trim()) return;
    const table = isChannel ? "chat_messages" : "direct_messages";
    const { error } = await supabase.from(table).update({ content: editContent.trim(), edited_at: new Date().toISOString() }).eq("id", messageId);
    if (error) { toast.error("Failed to edit message"); return; }
    setEditingMessageId(null); setEditContent("");
  };

  const handleDeleteMessage = async (messageId: string, isChannel: boolean) => {
    if (!confirm("Delete this message?")) return;
    const table = isChannel ? "chat_messages" : "direct_messages";
    const { error } = await supabase.from(table).delete().eq("id", messageId);
    if (error) { toast.error("Failed to delete message"); return; }
    if (isChannel) {
      setChannelMessages(prev => prev.filter(m => m.id !== messageId));
    } else {
      setDirectMessages(prev => prev.filter(m => m.id !== messageId));
    }
    toast.success("Message deleted");
  };

  const getDisplayName = (userId: string) => { const p = profiles[userId]; return p?.full_name || p?.email?.split("@")[0] || "User"; };

  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    if (view === "dm") return directMessages.find(m => m.id === replyToId) || null;
    return channelMessages.find(m => m.id === replyToId) || null;
  };

  const getSignedAttachmentUrl = useCallback(async (storedUrl: string) => {
    if (storedUrl.startsWith('http')) return storedUrl;
    const { data } = await supabase.storage.from('chat-attachments').createSignedUrl(storedUrl, 3600);
    return data?.signedUrl || storedUrl;
  }, []);

  const signedUrlsRef = useRef(signedUrls);
  signedUrlsRef.current = signedUrls;
  const resolveAttachmentUrl = useCallback(async (msgId: string, storedUrl: string) => {
    if (signedUrlsRef.current[msgId]) return;
    const url = await getSignedAttachmentUrl(storedUrl);
    setSignedUrls(prev => ({ ...prev, [msgId]: url }));
  }, [getSignedAttachmentUrl]);

  const currentChannel = channels.find(ch => ch.id === currentChannelId);
  const currentDMUser = onlineUsers.find(u => u.id === currentDMUserId);

  const filteredChannelMessages = useMemo(() => searchQuery ? channelMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : channelMessages, [channelMessages, searchQuery]);
  const filteredDirectMessages = useMemo(() => searchQuery ? directMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : directMessages, [directMessages, searchQuery]);

  const totalChannelUnread = useMemo(() => Object.values(channelUnreadCounts).reduce((sum, c) => sum + c, 0), [channelUnreadCounts]);
  const totalUnreadCount = unreadCount + totalChannelUnread;

  const groupedChannelMessages = useMemo(() => groupMessagesByDate(filteredChannelMessages), [filteredChannelMessages, groupMessagesByDate]);
  const groupedDirectMessages = useMemo(() => groupMessagesByDate(filteredDirectMessages), [filteredDirectMessages, groupMessagesByDate]);

  const isChannel = view === "chat";
  const activeMessages = isChannel ? groupedChannelMessages : groupedDirectMessages;

  const renderBubble = (msg: ChannelMessage | DirectMessage, isCh: boolean) => {
    const isOwn = isCh ? (msg as ChannelMessage).user_id === user?.id : (msg as DirectMessage).sender_id === user?.id;
    const senderId = isCh ? (msg as ChannelMessage).user_id : (msg as DirectMessage).sender_id;
    const profile = profiles[senderId];
    const displayName = isCh
      ? (profile?.full_name || (msg as ChannelMessage).user_name || (msg as ChannelMessage).user_email.split("@")[0])
      : (profile?.full_name || profile?.email?.split("@")[0] || "User");
    const email = isCh ? (msg as ChannelMessage).user_email : (profile?.email || "");
    const replyMessage = getReplyMessage(msg.reply_to_id);
    const replySourceName = replyMessage
      ? (isCh ? (profiles[(replyMessage as ChannelMessage).user_id]?.full_name || (replyMessage as ChannelMessage).user_name) : getDisplayName((replyMessage as DirectMessage).sender_id))
      : null;

    return (
      <ChatBubble
        key={msg.id}
        msg={msg}
        isChannel={isCh}
        isOwn={!!isOwn}
        profile={profile}
        displayName={displayName}
        email={email}
        replyMessage={replyMessage}
        replySourceName={replySourceName}
        reactions={reactions[msg.id] || []}
        userId={user?.id || ""}
        editingMessageId={editingMessageId}
        editContent={editContent}
        signedUrls={signedUrls}
        onSetReplyTo={setReplyTo}
        onSetEditingMessage={(id, content) => { setEditingMessageId(id); setEditContent(content); }}
        onCancelEdit={() => setEditingMessageId(null)}
        onEditContent={setEditContent}
        onSubmitEdit={handleEditMessage}
        onReaction={handleReaction}
        onDeleteMessage={handleDeleteMessage}
        onProfileClick={setProfileModalUserId}
        onResolveAttachment={resolveAttachmentUrl}
      />
    );
  };

  const renderMessagesList = (messages: { date: string; messages: (ChannelMessage | DirectMessage)[] }[], isCh: boolean) => (
    <>
      <div className={cn(
        "absolute top-0 left-0 right-0 z-20 flex justify-center py-2 transition-all duration-200",
        showStickyDate && stickyDate ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      )}>
        <span className="text-[11px] text-[hsl(var(--wa-bubble-in-foreground))] font-medium px-3 py-1 bg-[hsl(var(--wa-sidebar-bg)/0.95)] backdrop-blur-sm rounded-lg shadow-sm">
          {stickyDate}
        </span>
      </div>

      <ScrollArea className="flex-1 overflow-hidden [&>div[style]]:!overflow-x-hidden" viewportRef={scrollViewportRef} onScrollChange={handleScroll}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-[hsl(var(--wa-accent))] border-t-transparent rounded-full" /></div>
        ) : (
          <div className="space-y-1 py-3 min-w-0 overflow-hidden">
            {messages.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--wa-accent)/0.1)] mb-4">
                  <MessageCircle className="h-8 w-8 text-[hsl(var(--wa-accent))]" />
                </div>
                <p className="text-[hsl(var(--wa-bubble-in-foreground))] text-sm font-medium">
                  {searchQuery ? "No messages found" : "No messages yet"}
                </p>
                <p className="text-[hsl(var(--wa-meta))] text-xs mt-1">{isCh ? "Start the conversation!" : "Say hello! 👋"}</p>
              </div>
            ) : (
              messages.map((group) => (
                <div key={group.date}>
                  <div className="flex justify-center my-3" data-date-separator={group.date}>
                    <span className="text-[11px] text-[hsl(var(--wa-bubble-in-foreground))] font-medium px-3 py-1 bg-[hsl(var(--wa-sidebar-bg)/0.8)] rounded-lg shadow-sm">
                      {group.date}
                    </span>
                  </div>
                  <div className="space-y-1 min-w-0 overflow-hidden">
                    {group.messages.map((msg) => renderBubble(msg, isCh))}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className={cn(
        "absolute bottom-20 right-4 transition-all duration-200 z-10",
        showScrollButton ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
      )}>
        <button onClick={() => scrollToBottom()} className="bg-[hsl(var(--wa-sidebar-bg))] text-[hsl(var(--wa-bubble-in-foreground))] shadow-lg border border-[hsl(var(--wa-divider))] p-2 rounded-full hover:bg-[hsl(var(--wa-sidebar-hover))] transition-all" aria-label="Scroll to bottom">
          <ArrowDown className="h-5 w-5" />
        </button>
      </div>

      {(typingUsers.length > 0 || (isThinking && view === "chat" && channels.find(ch => ch.id === currentChannelId && isAIChannel(ch.name)))) && (
        <div className="text-xs text-[hsl(var(--wa-accent))] px-4 py-1 flex items-center gap-2 bg-[hsl(var(--wa-chat-bg))]">
          <span className="flex gap-0.5">
            <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-[hsl(var(--wa-accent))]" style={{ animationDelay: "0ms" }} />
            <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-[hsl(var(--wa-accent))]" style={{ animationDelay: "150ms" }} />
            <span className="animate-bounce w-1.5 h-1.5 rounded-full bg-[hsl(var(--wa-accent))]" style={{ animationDelay: "300ms" }} />
          </span>
          <span>
            {isThinking && view === "chat" && channels.find(ch => ch.id === currentChannelId && isAIChannel(ch.name))
              ? "MerchantHaus AI is thinking..."
              : typingUsers.length === 1 ? `${typingUsers[0].name} is typing...` : `${typingUsers.length} people are typing...`}
          </span>
        </div>
      )}

      <ChatComposer
        value={input}
        onSubmit={handleSendMessage}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        isChannel={isCh}
        profiles={profiles}
        getDisplayName={getDisplayName}
        pendingAttachment={pendingAttachment}
        onCancelAttachment={() => { if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url); setPendingAttachment(null); }}
        onFileSelect={() => fileInputRef.current?.click()}
        fileInputRef={fileInputRef}
        onFileChange={handleFileSelect}
        isRecording={isRecording}
        recordingTime={recordingTime}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onCancelRecording={cancelRecording}
      />
    </>
  );

  return (
    <TooltipProvider>
      {/* Desktop trigger only — mobile uses MobileAppDock */}
      {!isOpen && !isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-0 right-6 z-50 w-[220px] h-11 rounded-t-xl flex items-center gap-3 px-4",
            "bg-emerald-600 text-white",
            "shadow-xl hover:shadow-2xl hover:bg-emerald-500 transition-all duration-200 ease-out",
            "border border-b-0 border-emerald-700"
          )}
        >
          <MessageCircle className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">Messaging</span>
          {totalUnreadCount > 0 && (
            <span className="ml-auto bg-white/20 text-white text-xs font-medium min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
              {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden shadow-2xl",
            "bg-[hsl(var(--wa-chat-bg))]",
            "animate-in slide-in-from-bottom-4 fade-in-0 rounded-t-xl",
            isMobile
              ? "bottom-16 right-2 left-2 top-16 rounded-xl"
              : "bottom-0 right-6 border-b-0"
          )}
          style={!isMobile ? { width: chatWidth, height: chatHeight } : undefined}
        >
          {/* Resize handles (desktop only) */}
          {!isMobile && (
            <>
              <div
                onMouseDown={handleResizeMouseDown('top')}
                className="absolute top-0 left-4 right-4 h-1.5 cursor-n-resize z-10 hover:bg-[hsl(var(--wa-accent)/0.3)] transition-colors rounded-b"
              />
              <div
                onMouseDown={handleResizeMouseDown('left')}
                className="absolute left-0 top-4 bottom-4 w-1.5 cursor-w-resize z-10 hover:bg-[hsl(var(--wa-accent)/0.3)] transition-colors rounded-r"
              />
              <div
                onMouseDown={handleResizeMouseDown('topleft')}
                className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-20"
              />
            </>
          )}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[hsl(var(--wa-header))] text-[hsl(var(--wa-header-foreground))] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {isMobile && (view === "chat" || view === "dm" || view === "ai") && (
                <button onClick={() => setView("contacts")} className="hover:bg-white/10 p-1.5 rounded-full transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {(view === "contacts" || (!isMobile && !(view === "chat" || view === "dm" || view === "ai"))) && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  <h3 className="font-semibold text-sm">Messaging</h3>
                </div>
              )}
              {isMobile && view === "ai" && (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Atria AI</h3>
                  </div>
                </div>
              )}
              {isMobile && view === "chat" && (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{currentChannel?.name || "Chat"}</h3>
                  </div>
                </div>
              )}
              {isMobile && view === "dm" && currentDMUser && (
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={currentDMUser.avatarUrl || undefined} />
                      <AvatarFallback className={cn(getAvatarColor(currentDMUser.email || currentDMUser.name), "text-white text-[10px]")}>
                        {getInitials(currentDMUser.name, currentDMUser.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--wa-header))]", currentDMUser.isOnline ? "bg-[hsl(var(--wa-accent))]" : "bg-white/40")} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{currentDMUser.name}</h3>
                    <span className="text-[11px] text-white/70">
                      {currentDMUser.isOnline ? "online" : currentDMUser.lastSeen ? `last seen ${formatDistanceToNow(new Date(currentDMUser.lastSeen), { addSuffix: true })}` : "offline"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              {!isConnected && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs", isReconnecting ? "bg-amber-500/20 text-amber-200" : "bg-red-500/20 text-red-200")}>
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
                      if (permissionStatus !== 'granted') { const granted = await requestPermission(); toast[granted ? 'success' : 'error'](granted ? "Push notifications enabled" : "Notifications blocked"); }
                      else { toggleNotifications(); toast.info(notificationsEnabled ? "Notifications muted" : "Notifications unmuted"); }
                    }} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                      {permissionStatus === 'granted' && notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 opacity-60" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {permissionStatus !== 'granted' ? (permissionStatus === 'denied' ? "Notifications blocked" : "Enable notifications") : (notificationsEnabled ? "Mute" : "Unmute")}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={toggleSound} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-60" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{soundEnabled ? "Mute sounds" : "Unmute sounds"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => { setIsOpen(false); setTimeout(() => window.dispatchEvent(new CustomEvent("openOfficeSimulator")), 100); }} className="hover:bg-white/10 p-2 rounded-full transition-colors" aria-label="Office Simulator">
                    <Gamepad2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Office Simulator</TooltipContent>
              </Tooltip>
              {(view === "chat" || view === "dm") && (
                <button onClick={() => setShowSearch(!showSearch)} className={cn("hover:bg-white/10 p-2 rounded-full transition-colors", showSearch && "bg-white/10")}>
                  <Search className="h-4 w-4" />
                </button>
              )}
              {!isMobile && (
                <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="Minimize">
                  <Minus className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showSearch && (view === "chat" || view === "dm") && (
            <div className="p-2 bg-[hsl(var(--wa-sidebar-bg))] border-b border-[hsl(var(--wa-divider))]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--wa-meta))]" />
                <Input placeholder="Search messages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-sm bg-[hsl(var(--wa-search-bg))] border-0 text-[hsl(var(--wa-bubble-in-foreground))] placeholder:text-[hsl(var(--wa-meta))] focus-visible:ring-0" autoFocus />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden flex flex-col relative">
            {isMobile ? (
              <>
                {view === "contacts" && (
                  <ChatSidebar
                    channels={channels} onlineUsers={onlineUsers}
                    currentChannelId={currentChannelId} currentDMUserId={currentDMUserId}
                    view={view} channelUnreadCounts={channelUnreadCounts}
                    contactSearch={contactSearch} onContactSearchChange={setContactSearch}
                    onSelectChannel={handleSelectChannel} onSelectContact={handleSelectContact}
                    onSelectAI={() => setView("ai")}
                    onChannelsChanged={fetchChannels}
                  />
                )}
                {view === "ai" && <AIChatPanel />}
                {(view === "chat" || view === "dm") && (
                  <div className="flex-1 flex flex-col overflow-hidden relative bg-[hsl(var(--wa-chat-bg))]">
                    {renderMessagesList(activeMessages, isChannel)}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-[260px] border-r border-[hsl(var(--wa-divider))] flex flex-col overflow-hidden shrink-0">
                  <ChatSidebar
                    channels={channels} onlineUsers={onlineUsers}
                    currentChannelId={currentChannelId} currentDMUserId={currentDMUserId}
                    view={view} channelUnreadCounts={channelUnreadCounts}
                    contactSearch={contactSearch} onContactSearchChange={setContactSearch}
                    onSelectChannel={handleSelectChannel} onSelectContact={handleSelectContact}
                    onSelectAI={() => setView("ai")}
                    onChannelsChanged={fetchChannels}
                  />
                </div>
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {view === "ai" ? (
                    <AIChatPanel />
                  ) : (view === "chat" || view === "dm") ? (
                    <>
                      <div className="px-4 py-2 border-b border-[hsl(var(--wa-divider))] bg-[hsl(var(--wa-sidebar-bg))] flex items-center gap-2.5 shrink-0">
                        {view === "chat" && (
                          <>
                            <div className="w-8 h-8 rounded-full bg-[hsl(var(--wa-accent)/0.2)] flex items-center justify-center">
                              <Hash className="h-4 w-4 text-[hsl(var(--wa-accent))]" />
                            </div>
                            <span className="font-semibold text-sm text-[hsl(var(--wa-bubble-in-foreground))]">{currentChannel?.name || "Chat"}</span>
                          </>
                        )}
                        {view === "dm" && currentDMUser && (
                          <>
                            <div className="relative">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={currentDMUser.avatarUrl || undefined} />
                                <AvatarFallback className={cn(getAvatarColor(currentDMUser.email || currentDMUser.name), "text-white text-[10px]")}>
                                  {getInitials(currentDMUser.name, currentDMUser.email)}
                                </AvatarFallback>
                              </Avatar>
                              <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--wa-sidebar-bg))]", currentDMUser.isOnline ? "bg-[hsl(var(--wa-accent))]" : "bg-[hsl(var(--wa-meta))]")} />
                            </div>
                            <div>
                              <span className="font-semibold text-sm text-[hsl(var(--wa-bubble-in-foreground))]">{currentDMUser.name}</span>
                              <span className="text-xs text-[hsl(var(--wa-meta))] ml-2">
                                {currentDMUser.isOnline ? "online" : currentDMUser.lastSeen ? `last seen ${formatDistanceToNow(new Date(currentDMUser.lastSeen), { addSuffix: true })}` : "offline"}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col overflow-hidden relative bg-[hsl(var(--wa-chat-bg))]">
                        {renderMessagesList(activeMessages, isChannel)}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-[hsl(var(--wa-chat-bg))]">
                      <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[hsl(var(--wa-accent)/0.08)]">
                          <MessageCircle className="h-10 w-10 text-[hsl(var(--wa-accent)/0.4)]" />
                        </div>
                        <p className="text-[hsl(var(--wa-meta))] text-sm">Select a conversation to start messaging</p>
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
