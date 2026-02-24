import { supabase } from '@/integrations/supabase/client';

export interface QuoPhoneNumber {
  id: string;
  name: string;
  number: string;
  formattedNumber: string;
}

export interface QuoCall {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  duration: number;
  participants: string[];
  phoneNumberId: string;
  createdAt: string;
  completedAt?: string;
  answeredAt?: string;
}

export const quoApi = {
  async listPhoneNumbers(): Promise<{ success: boolean; data?: QuoPhoneNumber[]; error?: string }> {
    const { data, error } = await supabase.functions.invoke('quo-proxy', {
      body: { action: 'list-phone-numbers' },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to fetch phone numbers' };
    return { success: true, data: data.data?.data || [] };
  },

  async listCalls(params: {
    phoneNumberId: string;
    phoneNumber?: string;
    maxResults?: number;
  }): Promise<{ success: boolean; data?: QuoCall[]; error?: string }> {
    const proxyParams: Record<string, unknown> = {
      phoneNumberId: params.phoneNumberId,
      maxResults: params.maxResults,
    };
    // Pass the phone number as participants array if available
    if (params.phoneNumber) {
      proxyParams.participants = [params.phoneNumber];
    }
    const { data, error } = await supabase.functions.invoke('quo-proxy', {
      body: { action: 'list-calls', params: proxyParams },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to fetch calls' };
    return { success: true, data: data.data?.data || [] };
  },

  async setupWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('quo-proxy', {
      body: {
        action: 'create-webhook',
        params: {
          url: webhookUrl,
          events: ['call.ringing', 'call.completed', 'call.recording.completed', 'call.summary.completed', 'call.transcript.completed'],
          label: 'MerchantHaus CRM',
        },
      },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to create webhook' };
    return { success: true };
  },

  async listWebhooks(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const { data, error } = await supabase.functions.invoke('quo-proxy', {
      body: { action: 'list-webhooks' },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to list webhooks' };
    return { success: true, data: data.data?.data || [] };
  },
};
