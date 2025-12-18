import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  content: string;
  created_at: string;
  avatar_url?: string | null;
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
};

interface ChatBoxProps {
  messages: Message[];
  currentUserId: string;
  onSendMessage: (text: string) => void;
  profiles: Record<string, Profile>;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, currentUserId, onSendMessage, profiles }) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setInput("");
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto space-y-3 border rounded-md p-4 mb-4 bg-background">
        {messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user_id === currentUserId;
            const profile = profiles[msg.user_id];
            const displayName = profile?.full_name || msg.user_name || msg.user_email.split("@")[0];
            const avatarUrl = profile?.avatar_url;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
              >
                {!isOwn && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(displayName, msg.user_email)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-xs ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"} p-3 rounded-lg`}>
                  {!isOwn && (
                    <p className="text-xs font-semibold mb-1 opacity-80">{displayName}</p>
                  )}
                  <p className="text-sm">{msg.content}</p>
                  <p className={`text-xs mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
                {isOwn && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
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
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
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
}

const ChannelList: React.FC<ChannelListProps> = ({ channels, current, onSelect, onCreate }) => {
  const [newChannel, setNewChannel] = useState("");

  const handleCreate = () => {
    const trimmed = newChannel.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewChannel("");
    }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {channels.map((ch) => (
          <li key={ch.id}>
            <button
              type="button"
              onClick={() => onSelect(ch.id)}
              className={`w-full text-left px-2 py-1 rounded-md ${
                current === ch.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
              }`}
            >
              # {ch.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="New channel"
          value={newChannel}
          onChange={(e) => setNewChannel(e.target.value)}
        />
        <Button onClick={handleCreate} size="sm">Create</Button>
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

  const userName = teamMemberName || user?.email?.split("@")[0] || "";

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

    setChannels(data || []);
    if (data && data.length > 0 && !currentChannelId) {
      setCurrentChannelId(data[0].id);
    }
  }, [currentChannelId]);

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

  // Initial data load
  useEffect(() => {
    if (user) {
      fetchChannels().finally(() => setLoadingData(false));
    }
  }, [user, fetchChannels]);

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

  const handleSelectChannel = (id: string) => {
    setCurrentChannelId(id);
    setMessages([]);
  };

  const handleCreateChannel = async (name: string) => {
    const exists = channels.some(ch => ch.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast.error("Channel already exists");
      return;
    }

    const { error } = await supabase
      .from("chat_channels")
      .insert({ name, created_by: user?.id });

    if (error) {
      toast.error("Failed to create channel");
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!user || !currentChannelId) return;

    const { error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: currentChannelId,
        user_id: user.id,
        user_email: user.email || "",
        user_name: userName,
        content: text
      });

    if (error) {
      toast.error("Failed to send message");
    }
  };

  const currentChannel = channels.find(ch => ch.id === currentChannelId);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || loadingData) {
    return (
      <div className="p-4 flex items-center justify-center h-[70vh]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Chat</h1>
          <span className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{userName}</span>
          </span>
        </div>
        <Button variant="outline" asChild>
          <Link to="/">Home</Link>
        </Button>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 h-[70vh]">
        <aside className="lg:w-1/4 border rounded-md p-4 bg-background">
          <h2 className="mb-2 font-semibold">Channels</h2>
          <ChannelList
            channels={channels}
            current={currentChannelId}
            onSelect={handleSelectChannel}
            onCreate={handleCreateChannel}
          />
        </aside>
        <div className="flex-grow border rounded-md p-4 bg-background flex flex-col">
          <h2 className="mb-2 font-semibold capitalize">{currentChannel?.name || "Select a channel"}</h2>
          <ChatBox
            messages={messages}
            currentUserId={user?.id || ""}
            onSendMessage={handleSendMessage}
            profiles={profiles}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;