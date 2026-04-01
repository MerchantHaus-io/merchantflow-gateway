import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────

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
  userId?: string;
  contactIds?: string[];
}

export interface QuoMessage {
  id: string;
  from: string;
  to: string[];
  direction: 'incoming' | 'outgoing';
  text: string;
  status: string;
  createdAt: string;
  userId?: string;
  phoneNumberId: string;
  contactIds?: string[];
}

export interface QuoContact {
  id: string;
  defaultFields: {
    firstName?: string;
    lastName?: string;
    company?: string;
    role?: string;
    emails?: { name: string; value: string }[];
    phoneNumbers?: { name: string; value: string }[];
  };
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QuoConversation {
  id: string;
  phoneNumberId: string;
  participants: string[];
  lastActivityAt: string;
  unreadCount: number;
}

export interface QuoUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumberIds: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

async function invoke<T = unknown>(action: string, params?: Record<string, unknown>): Promise<{ success: boolean; data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('quo-proxy', {
    body: { action, params },
  });
  if (error) return { success: false, error: error.message };
  if (!data?.success) return { success: false, error: data?.error || `Failed: ${action}` };
  return { success: true, data: data.data };
}

// ── API ──────────────────────────────────────────────────────────────

export const quoApi = {
  // ── Phone Numbers ────────────────────────────────────────
  async listPhoneNumbers() {
    const result = await invoke<{ data: QuoPhoneNumber[] }>('list-phone-numbers');
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getPhoneNumber(phoneNumberId: string) {
    return invoke<QuoPhoneNumber>('get-phone-number', { phoneNumberId });
  },

  // ── Calls ────────────────────────────────────────────────
  async listCalls(params: {
    phoneNumberId: string;
    phoneNumber?: string;
    maxResults?: number;
    createdAfter?: string;
    createdBefore?: string;
  }) {
    const proxyParams: Record<string, unknown> = {
      phoneNumberId: params.phoneNumberId,
      maxResults: params.maxResults,
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
    };
    if (params.phoneNumber) proxyParams.participants = [params.phoneNumber];

    const result = await invoke<{ data: QuoCall[] }>('list-calls', proxyParams);
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getCall(callId: string) {
    return invoke<{ data: QuoCall }>('get-call', { callId });
  },

  async getCallSummary(callId: string) {
    return invoke<{ data: { summary: string[]; nextSteps: string[] } }>('get-call-summary', { callId });
  },

  async getCallTranscript(callId: string) {
    return invoke<{ data: { dialogue: { content: string; start: number; end: number; identifier: string; userId?: string }[] } }>('get-call-transcript', { callId });
  },

  async getCallRecordings(callId: string) {
    return invoke<{ data: { id: string; url: string | null; duration: number | null; startTime: string | null; status: string | null; type: string | null }[] }>('get-call-recordings', { callId });
  },

  async getCallVoicemail(callId: string) {
    return invoke<{ data: { url: string; duration: number; transcript: string } }>('get-call-voicemail', { callId });
  },

  // ── Messages ─────────────────────────────────────────────
  async listMessages(params: {
    phoneNumberId: string;
    participants?: string[];
    maxResults?: number;
    after?: string;
  }) {
    const result = await invoke<{ data: QuoMessage[] }>('list-messages', params);
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getMessage(messageId: string) {
    return invoke<{ data: QuoMessage }>('get-message', { messageId });
  },

  async sendMessage(params: {
    from: string;
    to: string | string[];
    text: string;
  }) {
    return invoke<{ data: QuoMessage }>('send-message', params);
  },

  // ── Contacts ─────────────────────────────────────────────
  async listContacts(params?: { maxResults?: number; after?: string; externalIds?: string[] }) {
    const result = await invoke<{ data: QuoContact[] }>('list-contacts', params);
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getContact(contactId: string) {
    return invoke<{ data: QuoContact }>('get-contact', { contactId });
  },

  async createContact(params: {
    defaultFields: {
      firstName?: string;
      lastName?: string;
      company?: string;
      role?: string;
      emails?: { name: string; value: string }[];
      phoneNumbers?: { name: string; value: string }[];
    };
    customFields?: Record<string, unknown>;
  }) {
    return invoke<{ data: QuoContact }>('create-contact', params);
  },

  async updateContact(contactId: string, params: {
    defaultFields?: Partial<QuoContact['defaultFields']>;
    customFields?: Record<string, unknown>;
  }) {
    return invoke<{ data: QuoContact }>('update-contact', { contactId, ...params });
  },

  async deleteContact(contactId: string) {
    return invoke('delete-contact', { contactId });
  },

  // ── Conversations ────────────────────────────────────────
  async listConversations(params?: { phoneNumberId?: string; userId?: string; maxResults?: number; after?: string }) {
    const result = await invoke<{ data: QuoConversation[] }>('list-conversations', params);
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  // ── Users ────────────────────────────────────────────────
  async listUsers() {
    const result = await invoke<{ data: QuoUser[] }>('list-users');
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getUser(userId: string) {
    return invoke<{ data: QuoUser }>('get-user', { userId });
  },

  // ── Contact Custom Fields ────────────────────────────────
  async getContactCustomFields() {
    return invoke<{ data: unknown[] }>('get-contact-custom-fields');
  },

  // ── Webhooks ─────────────────────────────────────────────
  async setupWebhook(webhookUrl: string, events?: string[]) {
    return invoke('create-webhook', {
      url: webhookUrl,
      events: events || [
        'call.ringing', 'call.completed', 'call.recording.completed',
        'call.summary.completed', 'call.transcript.completed',
      ],
      label: 'MerchantHaus CRM',
    });
  },

  async setupMessageWebhook(webhookUrl: string) {
    return invoke('create-webhook', {
      url: webhookUrl,
      events: ['message.received', 'message.delivered'],
      label: 'MerchantHaus CRM Messages',
    });
  },

  async listWebhooks() {
    const result = await invoke<{ data: any[] }>('list-webhooks');
    return { ...result, data: result.data?.data || (result.data as any) };
  },

  async getWebhook(webhookId: string) {
    return invoke('get-webhook', { webhookId });
  },

  async deleteWebhook(webhookId: string) {
    return invoke('delete-webhook', { webhookId });
  },
};
