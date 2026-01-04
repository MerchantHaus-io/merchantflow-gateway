import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Reply, X, Users, Hash, ListTodo, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { TEAM_MEMBERS, EMAIL_TO_USER, TEAM_MEMBER_COLORS } from "@/types/opportunity";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTasks } from "@/contexts/TasksContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useConnectionStatus, useTypingIndicator, validateMessage } from "@/hooks/useChatUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  channel_type?: 'group' | 'direct';
  participant_name?: string;
};

type Profile = {
  id: string;
  avatar_url: string | null;
  full_name: string | null;
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
}

const ChatBox: React.FC<ChatBoxProps> = ({ 
  messages, 
  currentUserId, 
  onSendMessage, 
  profiles, 
  typingUsers,
  onTyping 
}) => {
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed) {
      onSendMessage(trimmed, replyTo?.id);
      setInput("");
      setReplyTo(null);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto space-y-3 border rounded-md p-4 mb-4 bg-background">
        {messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user_id === currentUserId;
            const profile = profiles[msg.user_id];
            const displayName = getDisplayName(msg);
            const avatarUrl = profile?.avatar_url;
            const replyMessage = getReplyMessage(msg.reply_to_id);

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
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
                    <div className={`text-xs px-2 py-1 mb-1 rounded border-l-2 border-primary/50 bg-muted/50 ${isOwn ? "ml-auto" : ""}`}>
                      <span className="font-medium text-primary/70">{getDisplayName(replyMessage)}</span>
                      <p className="text-muted-foreground truncate">{replyMessage.content}</p>
                    </div>
                  )}
                  <div className={`${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"} p-3 rounded-lg group relative`}>
                    {!isOwn && (
                      <p className="text-xs font-semibold mb-1 opacity-80">{displayName}</p>
                    )}
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-xs mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
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

      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder={replyTo ? "Type your reply..." : "Type a message..."}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={replyTo ? "rounded-t-none" : ""}
        />
        <Button onClick={handleSend}>Send</Button>
      </div>
    </div>
  );
};

interface ChannelListProps {
  channels: Channel[];
  current: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onCreateDM: (memberName: string) => void;
  currentUserName: string;
  unreadByChannel: Record<string, number>;
}

const ChannelList: React.FC<ChannelListProps> = ({ channels, current, onSelect, onCreate, onCreateDM, currentUserName, unreadByChannel }) => {
  const [newChannel, setNewChannel] = useState("");

  const handleCreate = () => {
    const trimmed = newChannel.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewChannel("");
    }
  };

  // Separate group channels and direct messages
  const groupChannels = channels.filter(ch => ch.channel_type !== 'direct');
  
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

  return (
    <div className="space-y-4">
      {/* Group Channels */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
          <Hash className="h-3 w-3" />
          Channels
        </div>
        <ul className="space-y-1">
          {groupChannels.map((ch) => (
            <li key={ch.id}>
              <button
                type="button"
                onClick={() => onSelect(ch.id)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between",
                  current === ch.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  {ch.name}
                </span>
                {unreadByChannel[ch.id] && unreadByChannel[ch.id] > 0 && (
                  <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {unreadByChannel[ch.id] > 99 ? '99+' : unreadByChannel[ch.id]}
                  </span>
                )}
              </button>
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
          {directChannels.map((ch) => (
            <li key={ch.id}>
              <button
                type="button"
                onClick={() => onSelect(ch.id)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between",
                  current === ch.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {ch.participant_name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {ch.participant_name}
                </span>
                {unreadByChannel[ch.id] && unreadByChannel[ch.id] > 0 && (
                  <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {unreadByChannel[ch.id] > 99 ? '99+' : unreadByChannel[ch.id]}
                  </span>
                )}
              </button>
            </li>
          ))}
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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

    // Fetch profiles for all unique user_ids
    const userIds = [...new Set((data || []).map(m => m.user_id))];
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, avatar_url, full_name")
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

  // Fetch current user's profile
  const fetchCurrentUserProfile = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("id, avatar_url, full_name")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfiles(prev => ({ ...prev, [data.id]: data }));
    }
  }, [user]);

  // Initial data load
  useEffect(() => {
    if (user) {
      Promise.all([fetchChannels(), fetchCurrentUserProfile()])
        .finally(() => setLoadingData(false));
    }
  }, [user, fetchChannels, fetchCurrentUserProfile]);

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
              .select("id, avatar_url, full_name")
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
      <div className="flex flex-col h-full p-4 gap-4">
        <div className="flex items-center justify-between flex-shrink-0">
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
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          <aside className="lg:w-1/4 border rounded-md p-4 bg-background overflow-y-auto">
            <ChannelList
              channels={channels}
              current={currentChannelId}
              onSelect={handleSelectChannel}
              onCreate={handleCreateChannel}
              onCreateDM={handleCreateDM}
              currentUserName={userName}
              unreadByChannel={unreadByChannel}
            />
          </aside>
          <div className="flex-grow border rounded-md p-4 bg-background flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              {currentChannel?.channel_type === 'direct' ? (
                <>
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {currentChannel.participant_name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="font-semibold">{currentChannel.participant_name}</h2>
                </>
              ) : (
                <>
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">{getChannelDisplayName()}</h2>
                </>
              )}
            </div>
            <ChatBox
              messages={messages}
              currentUserId={user?.id || ""}
              onSendMessage={handleSendMessage}
              profiles={profiles}
              typingUsers={typingUsers}
              onTyping={handleTyping}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Chat;