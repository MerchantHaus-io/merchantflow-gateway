export type DirectMessage = {
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

export type ChannelMessage = {
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

export type Channel = {
  id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  avatar_url: string | null;
  full_name: string | null;
  email: string | null;
  last_seen?: string | null;
};

export type OnlineUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  unreadCount?: number;
  lastSeen?: string | null;
};

export type TypingUser = {
  id: string;
  name: string;
};

export type Reaction = {
  id: string;
  message_id: string;
  message_type: 'channel' | 'direct';
  user_id: string;
  user_email: string;
  emoji: string;
};

export type ChatView = "contacts" | "chat" | "dm" | "ai";

export const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

export const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: ['😀', '😃', '😄', '😁', '😆', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤔', '🫣', '🤭', '😐', '😑', '😶', '🙄', '😏', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'] },
  { label: "Gestures", emojis: ['👍', '👎', '👌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '💪', '🫶', '👏', '🫡'] },
  { label: "Hearts", emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { label: "Objects", emojis: ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🏆', '🥇', '🎯', '💡', '📌', '📎', '📊', '📈', '💰', '💎', '🔑', '🛠️', '⚡', '🚀', '💼', '📱', '💻'] },
  { label: "Faces", emojis: ['😎', '🤓', '🧐', '😤', '😠', '🤬', '😈', '👿', '💀', '☠️', '🤡', '👻', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
];

export const getAvatarColor = (str: string): string => {
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

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getInitials = (name: string | null, email: string) => {
  if (name) return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  return email.split("@")[0].slice(0, 2).toUpperCase();
};
