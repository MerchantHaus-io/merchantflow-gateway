import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * ChatBox component renders a scrollable list of messages along with an input
 * and send button.  Messages sent by the current user are aligned to the
 * right; messages from others are aligned to the left.
 */
type Message = { user: string; text: string; timestamp: number };

interface ChatBoxProps {
  messages: Message[];
  userName: string;
  onSendMessage: (text: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, userName, onSendMessage }) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto space-y-2 border rounded-md p-4 mb-4 bg-background">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.user === userName ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-xs p-2 rounded-md bg-muted">
              <span className="font-semibold mr-1">{msg.user}:</span>
              <span>{msg.text}</span>
            </div>
          </div>
        ))}
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

/**
 * ChannelList displays available channels and allows creating new ones.  It
 * does not maintain any chat state—it simply informs the parent which
 * channel is active and when to create a new one.
 */
interface ChannelListProps {
  channels: string[];
  current: string;
  onSelect: (name: string) => void;
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
          <li key={ch}>
            <button
              type="button"
              onClick={() => onSelect(ch)}
              className={`w-full text-left px-2 py-1 rounded-md ${
                current === ch ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
              }`}
            >
              # {ch}
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
        <Button onClick={handleCreate}>Create</Button>
      </div>
    </div>
  );
};

/**
 * Main Chat page component.  This component glues together the ChannelList
 * and ChatBox components and manages the state of channels, the active
 * channel, the message history and the current user name.  Messages and
 * channels are persisted to localStorage, and user identity is synced with
 * the authenticated user profile.
 */

// LocalStorage keys for chat state persistence
const STORAGE_KEYS = {
  CHANNELS: "merchantflow-chat-channels",
  MESSAGES: "merchantflow-chat-messages",
} as const;

// Type for stored messages organized by channel
type ChannelMessages = Record<string, Message[]>;

const Chat: React.FC = () => {
  const { user, teamMemberName, loading } = useAuth();

  // Derive display name from user profile
  const userName = teamMemberName || user?.email?.split("@")[0] || "";

  // Initialize channels from localStorage or default to ["general"]
  const [channels, setChannels] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHANNELS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors, use default
    }
    return ["general"];
  });

  const [currentChannel, setCurrentChannel] = useState<string>("general");

  // Initialize all channel messages from localStorage
  const [allMessages, setAllMessages] = useState<ChannelMessages>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors, use default
    }
    return {};
  });

  // Get messages for the current channel
  const messages = allMessages[currentChannel] || [];

  // Persist channels to localStorage whenever they change
  const saveChannels = useCallback((newChannels: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(newChannels));
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, []);

  // Persist messages to localStorage whenever they change
  const saveMessages = useCallback((newMessages: ChannelMessages) => {
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(newMessages));
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, []);

  const handleSelectChannel = (name: string) => {
    setCurrentChannel(name);
  };

  const handleCreateChannel = (name: string) => {
    if (!channels.includes(name)) {
      const newChannels = [...channels, name];
      setChannels(newChannels);
      saveChannels(newChannels);
    }
  };

  const handleSendMessage = (text: string) => {
    if (!userName) return;

    const newMessage: Message = {
      user: userName,
      text,
      timestamp: Date.now(),
    };

    setAllMessages((prev) => {
      const channelMessages = prev[currentChannel] || [];
      const updated = {
        ...prev,
        [currentChannel]: [...channelMessages, newMessage],
      };
      saveMessages(updated);
      return updated;
    });
  };

  // Redirect to login if not authenticated
  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-[70vh]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header with home navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Chat</h1>
          <span className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{userName}</span>
          </span>
        </div>
        {/* Navigate back to the dashboard/home */}
        <Button variant="outline" asChild>
          <Link to="/">Home</Link>
        </Button>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 h-[70vh]">
        <aside className="lg:w-1/4 border rounded-md p-4 bg-background">
          <h2 className="mb-2 font-semibold">Channels</h2>
          <ChannelList
            channels={channels}
            current={currentChannel}
            onSelect={handleSelectChannel}
            onCreate={handleCreateChannel}
          />
        </aside>
        <div className="flex-grow border rounded-md p-4 bg-background flex flex-col">
          <h2 className="mb-2 font-semibold capitalize">{currentChannel}</h2>
          <ChatBox
            messages={messages}
            userName={userName || ""}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;