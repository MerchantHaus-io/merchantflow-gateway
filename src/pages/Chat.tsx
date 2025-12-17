import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * ChatBox component renders a scrollable list of messages along with an input
 * and send button.  Messages sent by the current user are aligned to the
 * right; messages from others are aligned to the left.  This is a local
 * implementation—persisting messages to a backend is outside the scope of
 * this demo.
 */
type Message = { user: string; text: string };

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
                current === ch
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-muted"
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
 * channel, the message history and the current user name.  Messages are
 * stored in local state and are not persisted between sessions.
 */
const Chat: React.FC = () => {
  const [channels, setChannels] = useState<string[]>(["general"]);
  const [currentChannel, setCurrentChannel] = useState<string>("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
  let storedUser = localStorage.getItem("merchantflow-chat-user");
  if (!storedUser) {
    storedUser = `User${Math.floor(Math.random() * 10000)}`;
    localStorage.setItem("merchantflow-chat-user", storedUser);
  }
  setUserName(storedUser);
  }, []);

  const handleSelectChannel = (name: string) => {
    setCurrentChannel(name);
    setMessages([]);
  };

  const handleCreateChannel = (name: string) => {
    if (!channels.includes(name)) {
      setChannels((prev) => [...prev, name]);
    }
  };

  const handleSendMessage = (text: string) => {
    setMessages((prev) => [...prev, { user: userName || "Unknown", text }]);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Chat</h1>
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
