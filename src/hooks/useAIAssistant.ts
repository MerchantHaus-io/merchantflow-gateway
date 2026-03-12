import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AI_CHANNEL_NAME = "atria-ai";
const AI_BOT_EMAIL = "ai-assistant@ops.internal";

/**
 * Hook that detects when a user sends a message in the #ask-ai channel
 * and triggers the AI assistant edge function to reply.
 */
export const useAIAssistant = () => {
  const [isThinking, setIsThinking] = useState(false);

  const isAIChannel = useCallback((channelName: string) => {
    return channelName.toLowerCase() === AI_CHANNEL_NAME;
  }, []);

  const isAIBotMessage = useCallback((userEmail: string) => {
    return userEmail === AI_BOT_EMAIL;
  }, []);

  const triggerAIResponse = useCallback(async (channelId: string, userMessage: string) => {
    setIsThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          action: "chat",
          channelId,
          userMessage,
        },
      });

      if (error) {
        console.error("AI assistant error:", error);
        toast.error("Atria couldn't respond — please try again");
      }
      return data;
    } catch (err) {
      console.error("Failed to trigger AI response:", err);
      toast.error("Atria couldn't respond — please try again");
    } finally {
      setIsThinking(false);
    }
  }, []);

  const validateDocuments = useCallback(async (opportunityId: string) => {
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: {
        action: "validate-documents",
        opportunityId,
      },
    });

    if (error) throw error;
    return data;
  }, []);

  const scrutinizeWebsite = useCallback(async (opportunityId: string) => {
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: {
        action: "scrutinize-website",
        opportunityId,
      },
    });

    if (error) throw error;
    return data;
  }, []);

  const underwritingReview = useCallback(async (opportunityId: string) => {
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: {
        action: "underwriting-review",
        opportunityId,
      },
    });

    if (error) throw error;
    return data;
  }, []);

  return {
    isThinking,
    isAIChannel,
    isAIBotMessage,
    triggerAIResponse,
    validateDocuments,
    scrutinizeWebsite,
  };
};
