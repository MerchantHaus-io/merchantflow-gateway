export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          address1: string | null
          address2: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          state: string | null
          status: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address1?: string | null
          address2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          state?: string | null
          status?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address1?: string | null
          address2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          state?: string | null
          status?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      activities: {
        Row: {
          created_at: string
          description: string | null
          id: string
          opportunity_id: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          opportunity_id: string
          updated_at: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          opportunity_id: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          opportunity_id?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          email: string | null
          fax: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          opportunity_id: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          opportunity_id: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          opportunity_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          address: string | null
          address2: string | null
          application_complete: boolean | null
          application_form_received: boolean | null
          application_form_sent: boolean | null
          application_status: string | null
          assigned_to: string | null
          banking_info_received: boolean | null
          banking_info_requested: boolean | null
          call_scheduled: boolean | null
          city: string | null
          company: string | null
          completeness_verified: boolean | null
          country: string | null
          created_at: string
          docusign_sent: boolean | null
          email: string | null
          fax: string | null
          first_name: string | null
          gateway: string | null
          id: string
          integration: string | null
          is_live: boolean | null
          language: string | null
          last_name: string | null
          lead_name: string
          microsite_submitted: boolean | null
          notes: string | null
          phone: string | null
          processing_services: string[] | null
          processor: string | null
          processor_name: string | null
          referral_type: string | null
          referred_by: string | null
          sent_to_admin: boolean | null
          signed: boolean | null
          stage: string
          state: string | null
          timezone: string | null
          updated_at: string
          user_id: string | null
          username: string | null
          value_services: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          address2?: string | null
          application_complete?: boolean | null
          application_form_received?: boolean | null
          application_form_sent?: boolean | null
          application_status?: string | null
          assigned_to?: string | null
          banking_info_received?: boolean | null
          banking_info_requested?: boolean | null
          call_scheduled?: boolean | null
          city?: string | null
          company?: string | null
          completeness_verified?: boolean | null
          country?: string | null
          created_at?: string
          docusign_sent?: boolean | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          gateway?: string | null
          id?: string
          integration?: string | null
          is_live?: boolean | null
          language?: string | null
          last_name?: string | null
          lead_name: string
          microsite_submitted?: boolean | null
          notes?: string | null
          phone?: string | null
          processing_services?: string[] | null
          processor?: string | null
          processor_name?: string | null
          referral_type?: string | null
          referred_by?: string | null
          sent_to_admin?: boolean | null
          signed?: boolean | null
          stage?: string
          state?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
          value_services?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          address2?: string | null
          application_complete?: boolean | null
          application_form_received?: boolean | null
          application_form_sent?: boolean | null
          application_status?: string | null
          assigned_to?: string | null
          banking_info_received?: boolean | null
          banking_info_requested?: boolean | null
          call_scheduled?: boolean | null
          city?: string | null
          company?: string | null
          completeness_verified?: boolean | null
          country?: string | null
          created_at?: string
          docusign_sent?: boolean | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          gateway?: string | null
          id?: string
          integration?: string | null
          is_live?: boolean | null
          language?: string | null
          last_name?: string | null
          lead_name?: string
          microsite_submitted?: boolean | null
          notes?: string | null
          phone?: string | null
          processing_services?: string[] | null
          processor?: string | null
          processor_name?: string | null
          referral_type?: string | null
          referred_by?: string | null
          sent_to_admin?: boolean | null
          signed?: boolean | null
          stage?: string
          state?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
          value_services?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          account_id: string
          agree_to_terms: boolean | null
          assigned_to: string | null
          contact_id: string
          created_at: string
          id: string
          language: string | null
          processing_services: string[] | null
          referral_source: string | null
          stage: string
          stage_entered_at: string | null
          status: string | null
          timezone: string | null
          updated_at: string
          username: string | null
          value_services: string[] | null
        }
        Insert: {
          account_id: string
          agree_to_terms?: boolean | null
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          id?: string
          language?: string | null
          processing_services?: string[] | null
          referral_source?: string | null
          stage?: string
          stage_entered_at?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          value_services?: string[] | null
        }
        Update: {
          account_id?: string
          agree_to_terms?: boolean | null
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          language?: string | null
          processing_services?: string[] | null
          referral_source?: string | null
          stage?: string
          stage_entered_at?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          value_services?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_email: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
