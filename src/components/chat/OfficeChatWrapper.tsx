import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import OfficeChat, { ChatMessage } from "./OfficeChat";

/**
 * Wrapper that connects the 3D OfficeChat component to real Supabase
 * direct messages and presence data.
 */
export default function OfficeChatWrapper() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  const currentUserEmail = user?.email || "";

  // Fetch DMs involving current user
  const fetchMessages = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("direct_messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error || !data) return;

    // We need to map sender/receiver UUIDs to emails via profiles
    const userIds = new Set<string>();
    data.forEach((m) => {
      userIds.add(m.sender_id);
      userIds.add(m.receiver_id);
    });

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", Array.from(userIds));

    const emailMap: Record<string, string> = {};
    (profiles || []).forEach((p) => {
      if (p.email) emailMap[p.id] = p.email;
    });

    const mapped: ChatMessage[] = data.map((m) => ({
      id: m.id,
      fromEmail: emailMap[m.sender_id] || m.sender_id,
      toEmail: emailMap[m.receiver_id] || m.receiver_id,
      body: m.content,
      timestamp: new Date(m.created_at),
    }));

    setMessages(mapped);
  }, [user]);

  // Subscribe to new DMs in realtime
  useEffect(() => {
    if (!user) return;
    fetchMessages();

    const channel = supabase
      .channel("office-chat-dms")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => fetchMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMessages]);

  // Presence from profiles.last_seen
  useEffect(() => {
    if (!user) return;
    const fetchPresence = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email, last_seen");
      if (!data) return;
      const now = Date.now();
      const map: Record<string, boolean> = {};
      data.forEach((p) => {
        if (p.email) {
          const lastSeen = p.last_seen ? new Date(p.last_seen).getTime() : 0;
          map[p.email] = now - lastSeen < 120000;
        }
      });
      setPresence(map);
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Send message handler
  const handleSendMessage = useCallback(
    async (toEmail: string, body: string) => {
      if (!user) return;
      // Look up receiver profile by email
      const { data: receiverProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", toEmail)
        .limit(1)
        .single();

      if (!receiverProfile) return;

      await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: receiverProfile.id,
        content: body,
      });
    },
    [user]
  );

  if (!currentUserEmail) return null;

  return (
    <OfficeChat
      currentUserEmail={currentUserEmail}
      messages={messages}
      onSendMessage={handleSendMessage}
      presence={presence}
    />
  );
}
