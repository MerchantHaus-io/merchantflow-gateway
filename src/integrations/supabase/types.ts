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
          commission_model: string
          country: string | null
          created_at: string
          id: string
          kurv_per_txn_fee: number | null
          kurv_residual_split: number | null
          kurv_volume_rate_pct: number | null
          name: string
          nmi_merchant_id: string | null
          referrer_id: string | null
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
          commission_model?: string
          country?: string | null
          created_at?: string
          id?: string
          kurv_per_txn_fee?: number | null
          kurv_residual_split?: number | null
          kurv_volume_rate_pct?: number | null
          name: string
          nmi_merchant_id?: string | null
          referrer_id?: string | null
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
          commission_model?: string
          country?: string | null
          created_at?: string
          id?: string
          kurv_per_txn_fee?: number | null
          kurv_residual_split?: number | null
          kurv_volume_rate_pct?: number | null
          name?: string
          nmi_merchant_id?: string | null
          referrer_id?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      action_items: {
        Row: {
          assigned_to: string[]
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string
          created_by_email: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          assigned_to?: string[]
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by: string
          created_by_email: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          assigned_to?: string[]
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string
          created_by_email?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          opportunity_id: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          opportunity_id: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
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
      admin_popup_acknowledgments: {
        Row: {
          acknowledged_at: string
          id: string
          popup_id: string
          user_email: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          popup_id: string
          user_email: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          popup_id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_popup_acknowledgments_popup_id_fkey"
            columns: ["popup_id"]
            isOneToOne: false
            referencedRelation: "admin_popups"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_popups: {
        Row: {
          content: string
          created_at: string
          created_by: string
          created_by_email: string
          expires_at: string | null
          id: string
          is_active: boolean
          min_display_seconds: number
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          created_by_email: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          min_display_seconds?: number
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          created_by_email?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          min_display_seconds?: number
          title?: string
        }
        Relationships: []
      }
      agenda_items: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          status: string
          submitted_by: string
          submitted_by_email: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          submitted_by: string
          submitted_by_email: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          submitted_by?: string
          submitted_by_email?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      application_documents: {
        Row: {
          application_id: string
          content_type: string | null
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          application_id: string
          content_type?: string | null
          created_at?: string
          document_type?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          application_id?: string
          content_type?: string | null
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_secrets: {
        Row: {
          account_enc: string | null
          application_id: string
          created_at: string
          key_version: number | null
          purged_at: string | null
          routing_enc: string | null
          ssn_enc: string | null
        }
        Insert: {
          account_enc?: string | null
          application_id: string
          created_at?: string
          key_version?: number | null
          purged_at?: string | null
          routing_enc?: string | null
          ssn_enc?: string | null
        }
        Update: {
          account_enc?: string | null
          application_id?: string
          created_at?: string
          key_version?: number | null
          purged_at?: string | null
          routing_enc?: string | null
          ssn_enc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_secrets_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          accepted_cards: string | null
          address: string | null
          address2: string | null
          avg_ticket: string | null
          business_structure: string | null
          business_type: string | null
          city: string | null
          company_name: string | null
          created_at: string
          current_processor: string | null
          date_established: string | null
          dba_name: string | null
          ecommerce_percent: string | null
          email: string
          federal_tax_id: string | null
          full_name: string
          high_ticket: string | null
          id: string
          in_person_percent: string | null
          keyed_percent: string | null
          legal_name: string | null
          message: string | null
          monthly_volume: string | null
          nature_of_business: string | null
          notes: string | null
          owner_address: string | null
          owner_city: string | null
          owner_dob: string | null
          owner_name: string | null
          owner_ssn_last4: string | null
          owner_state: string | null
          owner_title: string | null
          owner_zip: string | null
          phone: string | null
          portal_merchant_id: string | null
          products: string | null
          raw_portal_data: Json | null
          referral_source: string | null
          referrer_id: string | null
          service_type: string | null
          source: string | null
          state: string | null
          state_of_incorporation: string | null
          status: string | null
          submitted_at: string | null
          underwriting_status: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          accepted_cards?: string | null
          address?: string | null
          address2?: string | null
          avg_ticket?: string | null
          business_structure?: string | null
          business_type?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          current_processor?: string | null
          date_established?: string | null
          dba_name?: string | null
          ecommerce_percent?: string | null
          email: string
          federal_tax_id?: string | null
          full_name: string
          high_ticket?: string | null
          id?: string
          in_person_percent?: string | null
          keyed_percent?: string | null
          legal_name?: string | null
          message?: string | null
          monthly_volume?: string | null
          nature_of_business?: string | null
          notes?: string | null
          owner_address?: string | null
          owner_city?: string | null
          owner_dob?: string | null
          owner_name?: string | null
          owner_ssn_last4?: string | null
          owner_state?: string | null
          owner_title?: string | null
          owner_zip?: string | null
          phone?: string | null
          portal_merchant_id?: string | null
          products?: string | null
          raw_portal_data?: Json | null
          referral_source?: string | null
          referrer_id?: string | null
          service_type?: string | null
          source?: string | null
          state?: string | null
          state_of_incorporation?: string | null
          status?: string | null
          submitted_at?: string | null
          underwriting_status?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          accepted_cards?: string | null
          address?: string | null
          address2?: string | null
          avg_ticket?: string | null
          business_structure?: string | null
          business_type?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          current_processor?: string | null
          date_established?: string | null
          dba_name?: string | null
          ecommerce_percent?: string | null
          email?: string
          federal_tax_id?: string | null
          full_name?: string
          high_ticket?: string | null
          id?: string
          in_person_percent?: string | null
          keyed_percent?: string | null
          legal_name?: string | null
          message?: string | null
          monthly_volume?: string | null
          nature_of_business?: string | null
          notes?: string | null
          owner_address?: string | null
          owner_city?: string | null
          owner_dob?: string | null
          owner_name?: string | null
          owner_ssn_last4?: string | null
          owner_state?: string | null
          owner_title?: string | null
          owner_zip?: string | null
          phone?: string | null
          portal_merchant_id?: string | null
          products?: string | null
          raw_portal_data?: Json | null
          referral_source?: string | null
          referrer_id?: string | null
          service_type?: string | null
          source?: string | null
          state?: string | null
          state_of_incorporation?: string | null
          status?: string | null
          submitted_at?: string | null
          underwriting_status?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_entries: {
        Row: {
          audit_date: string
          created_at: string
          description: string
          expected_outcome: string
          id: string
          item_id: string
          prompt: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          audit_date?: string
          created_at?: string
          description?: string
          expected_outcome?: string
          id?: string
          item_id: string
          prompt?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          audit_date?: string
          created_at?: string
          description?: string
          expected_outcome?: string
          id?: string
          item_id?: string
          prompt?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      backup_change_queue: {
        Row: {
          created_at: string
          flushed_at: string | null
          id: number
          op: string
          payload: Json
          row_pk: string | null
          table_name: string
        }
        Insert: {
          created_at?: string
          flushed_at?: string | null
          id?: number
          op: string
          payload: Json
          row_pk?: string | null
          table_name: string
        }
        Update: {
          created_at?: string
          flushed_at?: string | null
          id?: number
          op?: string
          payload?: Json
          row_pk?: string | null
          table_name?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          bytes: number | null
          drive_file_id: string | null
          drive_file_name: string | null
          drive_web_link: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          rows_flushed: number | null
          started_at: string
          status: string
          table_counts: Json | null
          triggered_by: string | null
        }
        Insert: {
          bytes?: number | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_web_link?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          rows_flushed?: number | null
          started_at?: string
          status: string
          table_counts?: Json | null
          triggered_by?: string | null
        }
        Update: {
          bytes?: number | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_web_link?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          rows_flushed?: number | null
          started_at?: string
          status?: string
          table_counts?: Json | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_holder_name: string | null
          account_last4: string | null
          application_id: string
          bank_name: string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          account_holder_name?: string | null
          account_last4?: string | null
          application_id: string
          bank_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string | null
          account_last4?: string | null
          application_id?: string
          bank_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficial_owners: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_state: string | null
          address_zip: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          opportunity_id: string
          ownership_percentage: number
          title: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          opportunity_id: string
          ownership_percentage: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          opportunity_id?: string
          ownership_percentage?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficial_owners_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_doc_sequences: {
        Row: {
          doc_type: string
          last_value: number
          year: number
        }
        Insert: {
          doc_type: string
          last_value?: number
          year: number
        }
        Update: {
          doc_type?: string
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      billing_documents: {
        Row: {
          account_id: string
          amount_paid: number
          ancillary_fees: Json
          billing_cycle: string | null
          created_at: string
          created_by: string | null
          currency: string
          doc_number: string
          doc_type: string
          due_date: string | null
          gateway_tier: string | null
          id: string
          issued_date: string
          line_items: Json
          merchant_email: string | null
          merchant_name: string | null
          merchant_phone: string | null
          notes: string | null
          opportunity_id: string | null
          paid_date: string | null
          pdf_path: string | null
          period_end: string | null
          period_start: string | null
          sender: Json | null
          sent_at: string | null
          sent_to: string[] | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_paid?: number
          ancillary_fees?: Json
          billing_cycle?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_number: string
          doc_type: string
          due_date?: string | null
          gateway_tier?: string | null
          id?: string
          issued_date?: string
          line_items?: Json
          merchant_email?: string | null
          merchant_name?: string | null
          merchant_phone?: string | null
          notes?: string | null
          opportunity_id?: string | null
          paid_date?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          sender?: Json | null
          sent_at?: string | null
          sent_to?: string[] | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_paid?: number
          ancillary_fees?: Json
          billing_cycle?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_number?: string
          doc_type?: string
          due_date?: string | null
          gateway_tier?: string | null
          id?: string
          issued_date?: string
          line_items?: Json
          merchant_email?: string | null
          merchant_name?: string | null
          merchant_phone?: string | null
          notes?: string | null
          opportunity_id?: string | null
          paid_date?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          sender?: Json | null
          sent_at?: string | null
          sent_to?: string[] | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_acknowledgments: {
        Row: {
          acknowledged_at: string
          broadcast_key: string
          id: string
          user_email: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          broadcast_key: string
          id?: string
          user_email: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          broadcast_key?: string
          id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      cadence_steps: {
        Row: {
          body_html: string
          campaign_id: string
          created_at: string
          delay_days: number
          id: string
          step_number: number
          subject: string
        }
        Insert: {
          body_html: string
          campaign_id: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject: string
        }
        Update: {
          body_html?: string
          campaign_id?: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          account_id: string | null
          all_day: boolean
          attendees: Json | null
          calendar_id: string | null
          calendar_owner_email: string | null
          color: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          end_time: string
          google_event_id: string | null
          html_link: string | null
          id: string
          location: string | null
          opportunity_id: string | null
          organizer_email: string | null
          reminder_1h_sent: boolean
          reminder_24h_sent: boolean
          reminder_created_sent: boolean
          start_time: string
          status: string | null
          synced_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          all_day?: boolean
          attendees?: Json | null
          calendar_id?: string | null
          calendar_owner_email?: string | null
          color?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          google_event_id?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          opportunity_id?: string | null
          organizer_email?: string | null
          reminder_1h_sent?: boolean
          reminder_24h_sent?: boolean
          reminder_created_sent?: boolean
          start_time: string
          status?: string | null
          synced_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          all_day?: boolean
          attendees?: Json | null
          calendar_id?: string | null
          calendar_owner_email?: string | null
          color?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          google_event_id?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          opportunity_id?: string | null
          organizer_email?: string | null
          reminder_1h_sent?: boolean
          reminder_24h_sent?: boolean
          reminder_created_sent?: boolean
          start_time?: string
          status?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          account_id: string | null
          answered_at: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          duration: number | null
          id: string
          initiated_by: string | null
          next_steps: string[] | null
          notes: string | null
          opportunity_id: string | null
          participants: string[] | null
          phone_number: string | null
          quo_call_id: string | null
          quo_phone_number_id: string | null
          recording_url: string | null
          status: string
          summary: string[] | null
          transcript: Json | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          answered_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration?: number | null
          id?: string
          initiated_by?: string | null
          next_steps?: string[] | null
          notes?: string | null
          opportunity_id?: string | null
          participants?: string[] | null
          phone_number?: string | null
          quo_call_id?: string | null
          quo_phone_number_id?: string | null
          recording_url?: string | null
          status?: string
          summary?: string[] | null
          transcript?: Json | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          answered_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration?: number | null
          id?: string
          initiated_by?: string | null
          next_steps?: string[] | null
          notes?: string | null
          opportunity_id?: string | null
          participants?: string[] | null
          phone_number?: string | null
          quo_call_id?: string | null
          quo_phone_number_id?: string | null
          recording_url?: string | null
          status?: string
          summary?: string[] | null
          transcript?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          channel_id: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          reply_to_id: string | null
          user_email: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          channel_id: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          user_email: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          channel_id?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          user_email?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          component_stack: string | null
          created_at: string
          error_id: string
          id: number
          message: string
          release: string | null
          route: string | null
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          error_id: string
          id?: number
          message: string
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          error_id?: string
          id?: number
          message?: string
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      client_interactions: {
        Row: {
          account_id: string
          channel: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          duration_minutes: number | null
          follow_up_at: string | null
          id: string
          interaction_type: string
          notes: string | null
          outcome: string | null
          priority: string
          resolution: string | null
          status: string
          subject: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          account_id: string
          channel?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          duration_minutes?: number | null
          follow_up_at?: string | null
          id?: string
          interaction_type?: string
          notes?: string | null
          outcome?: string | null
          priority?: string
          resolution?: string | null
          status?: string
          subject: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          account_id?: string
          channel?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          duration_minutes?: number | null
          follow_up_at?: string | null
          id?: string
          interaction_type?: string
          notes?: string | null
          outcome?: string | null
          priority?: string
          resolution?: string | null
          status?: string
          subject?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
      commission_periods: {
        Row: {
          created_at: string
          fetched_at: string | null
          id: string
          period_end: string
          period_start: string
          status: string
          total_commission: number | null
          total_transactions: number | null
          total_volume: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string | null
          id?: string
          period_end: string
          period_start: string
          status?: string
          total_commission?: number | null
          total_transactions?: number | null
          total_volume?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fetched_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          status?: string
          total_commission?: number | null
          total_transactions?: number | null
          total_volume?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      commission_records: {
        Row: {
          account_id: string | null
          chargeback_fees: number | null
          commission_change_pct: number | null
          company_name: string | null
          created_at: string
          gateway_invoiced: number
          gateway_margin: number
          id: string
          monthly_fees: number | null
          nmi_gateway_id: string
          period_id: string
          referrer_payout: number
          residual_amount: number | null
          residual_rate: number | null
          total_commission: number | null
          transaction_count: number | null
          transaction_fees: number | null
          transaction_volume: number | null
          volume_change_pct: number | null
        }
        Insert: {
          account_id?: string | null
          chargeback_fees?: number | null
          commission_change_pct?: number | null
          company_name?: string | null
          created_at?: string
          gateway_invoiced?: number
          gateway_margin?: number
          id?: string
          monthly_fees?: number | null
          nmi_gateway_id: string
          period_id: string
          referrer_payout?: number
          residual_amount?: number | null
          residual_rate?: number | null
          total_commission?: number | null
          transaction_count?: number | null
          transaction_fees?: number | null
          transaction_volume?: number | null
          volume_change_pct?: number | null
        }
        Update: {
          account_id?: string | null
          chargeback_fees?: number | null
          commission_change_pct?: number | null
          company_name?: string | null
          created_at?: string
          gateway_invoiced?: number
          gateway_margin?: number
          id?: string
          monthly_fees?: number | null
          nmi_gateway_id?: string
          period_id?: string
          referrer_payout?: number
          residual_amount?: number | null
          residual_rate?: number | null
          total_commission?: number | null
          transaction_count?: number | null
          transaction_fees?: number | null
          transaction_volume?: number | null
          volume_change_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          merchant_count: number
          period_month: number
          period_year: number
          raw_response: Json | null
          source_api: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          merchant_count?: number
          period_month: number
          period_year: number
          raw_response?: Json | null
          source_api?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          merchant_count?: number
          period_month?: number
          period_year?: number
          raw_response?: Json | null
          source_api?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
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
      deletion_requests: {
        Row: {
          created_at: string
          entity_id: string
          entity_name: string
          entity_type: string
          id: string
          reason: string | null
          requester_email: string
          requester_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_name: string
          entity_type: string
          id?: string
          reason?: string | null
          requester_email: string
          requester_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_name?: string
          entity_type?: string
          id?: string
          reason?: string | null
          requester_email?: string
          requester_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          edited_at: string | null
          id: string
          read_at: string | null
          receiver_id: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          read_at?: string | null
          receiver_id: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          read_at?: string | null
          receiver_id?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_type: string | null
          created_at: string
          document_type: string | null
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
          document_type?: string | null
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
          document_type?: string | null
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
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          refresh_token: string
          scopes: string | null
          updated_at: string | null
          user_email: string
          user_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          scopes?: string | null
          updated_at?: string | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          scopes?: string | null
          updated_at?: string | null
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      internal_cron_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      kurv_api_tokens: {
        Row: {
          created_at: string
          environment: string
          expires_at: string
          id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment: string
          expires_at: string
          id?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          expires_at?: string
          id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      kurv_deal_submissions: {
        Row: {
          created_at: string
          deal_id: string | null
          deal_type: string
          error: string | null
          id: string
          idempotency_key: string | null
          opportunity_id: string | null
          payload: Json
          response: Json | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          deal_type: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          opportunity_id?: string | null
          payload?: Json
          response?: Json | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          deal_type?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          opportunity_id?: string | null
          payload?: Json
          response?: Json | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kurv_deal_submissions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      kurv_merchants: {
        Row: {
          account_id: string | null
          boarded_at: string | null
          created_at: string
          dba_name: string | null
          id: string
          last_synced_at: string
          legal_name: string | null
          mcc: string | null
          mid: string
          opportunity_id: string | null
          processor: string | null
          raw: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          boarded_at?: string | null
          created_at?: string
          dba_name?: string | null
          id?: string
          last_synced_at?: string
          legal_name?: string | null
          mcc?: string | null
          mid: string
          opportunity_id?: string | null
          processor?: string | null
          raw?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          boarded_at?: string | null
          created_at?: string
          dba_name?: string | null
          id?: string
          last_synced_at?: string
          legal_name?: string | null
          mcc?: string | null
          mid?: string
          opportunity_id?: string | null
          processor?: string | null
          raw?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kurv_merchants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kurv_merchants_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      kurv_sync_logs: {
        Row: {
          created_at: string
          details: Json | null
          duration_ms: number | null
          error: string | null
          id: string
          job: string
          rows_processed: number | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job: string
          rows_processed?: number | null
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job?: string
          rows_processed?: number | null
          status?: string
        }
        Relationships: []
      }
      kurv_transactions_daily: {
        Row: {
          business_date: string
          created_at: string
          deposit_amount: number | null
          id: string
          interchange_amount: number | null
          last_synced_at: string
          mid: string
          raw: Json
          refunds_amount: number | null
          refunds_count: number | null
          sales_amount: number | null
          sales_count: number | null
        }
        Insert: {
          business_date: string
          created_at?: string
          deposit_amount?: number | null
          id?: string
          interchange_amount?: number | null
          last_synced_at?: string
          mid: string
          raw?: Json
          refunds_amount?: number | null
          refunds_count?: number | null
          sales_amount?: number | null
          sales_count?: number | null
        }
        Update: {
          business_date?: string
          created_at?: string
          deposit_amount?: number | null
          id?: string
          interchange_amount?: number | null
          last_synced_at?: string
          mid?: string
          raw?: Json
          refunds_amount?: number | null
          refunds_count?: number | null
          sales_amount?: number | null
          sales_count?: number | null
        }
        Relationships: []
      }
      lead_referrers: {
        Row: {
          created_at: string
          id: string
          institution: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_audit_log: {
        Row: {
          args: Json | null
          created_at: string
          error: string | null
          id: string
          result_summary: string | null
          success: boolean
          tool_name: string
        }
        Insert: {
          args?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          result_summary?: string | null
          success?: boolean
          tool_name: string
        }
        Update: {
          args?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          result_summary?: string | null
          success?: boolean
          tool_name?: string
        }
        Relationships: []
      }
      merchant_consents: {
        Row: {
          accepted_at: string
          account_authorization_accepted: boolean
          applicant_email: string
          applicant_name: string
          application_id: string | null
          beneficial_ownership_accepted: boolean
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          merchant_agreement_accepted: boolean
          terms_version: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          account_authorization_accepted?: boolean
          applicant_email: string
          applicant_name: string
          application_id?: string | null
          beneficial_ownership_accepted?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          merchant_agreement_accepted?: boolean
          terms_version?: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          account_authorization_accepted?: boolean
          applicant_email?: string
          applicant_name?: string
          application_id?: string | null
          beneficial_ownership_accepted?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          merchant_agreement_accepted?: boolean
          terms_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_consents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          application_id: string
          average_transaction: string | null
          business_formation_date: string | null
          created_at: string
          dba_address_line1: string | null
          dba_address_line2: string | null
          dba_city: string | null
          dba_contact_email: string | null
          dba_contact_first_name: string | null
          dba_contact_last_name: string | null
          dba_contact_phone: string | null
          dba_country: string | null
          dba_name: string | null
          dba_state: string | null
          dba_zip: string | null
          federal_tax_id: string | null
          high_ticket: string | null
          id: string
          legal_address_line1: string | null
          legal_address_line2: string | null
          legal_city: string | null
          legal_country: string | null
          legal_entity_name: string | null
          legal_state: string | null
          legal_zip: string | null
          monthly_volume: string | null
          nature_of_business: string | null
          ownership_type: string | null
          percent_b2b: string | null
          percent_b2c: string | null
          percent_ecommerce: string | null
          percent_keyed: string | null
          percent_moto: string | null
          percent_swiped: string | null
          product_description: string | null
          referrer_id: string | null
          sic_mcc_code: string | null
          state_incorporated: string | null
          tax_exempt: boolean | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          application_id: string
          average_transaction?: string | null
          business_formation_date?: string | null
          created_at?: string
          dba_address_line1?: string | null
          dba_address_line2?: string | null
          dba_city?: string | null
          dba_contact_email?: string | null
          dba_contact_first_name?: string | null
          dba_contact_last_name?: string | null
          dba_contact_phone?: string | null
          dba_country?: string | null
          dba_name?: string | null
          dba_state?: string | null
          dba_zip?: string | null
          federal_tax_id?: string | null
          high_ticket?: string | null
          id?: string
          legal_address_line1?: string | null
          legal_address_line2?: string | null
          legal_city?: string | null
          legal_country?: string | null
          legal_entity_name?: string | null
          legal_state?: string | null
          legal_zip?: string | null
          monthly_volume?: string | null
          nature_of_business?: string | null
          ownership_type?: string | null
          percent_b2b?: string | null
          percent_b2c?: string | null
          percent_ecommerce?: string | null
          percent_keyed?: string | null
          percent_moto?: string | null
          percent_swiped?: string | null
          product_description?: string | null
          referrer_id?: string | null
          sic_mcc_code?: string | null
          state_incorporated?: string | null
          tax_exempt?: boolean | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          application_id?: string
          average_transaction?: string | null
          business_formation_date?: string | null
          created_at?: string
          dba_address_line1?: string | null
          dba_address_line2?: string | null
          dba_city?: string | null
          dba_contact_email?: string | null
          dba_contact_first_name?: string | null
          dba_contact_last_name?: string | null
          dba_contact_phone?: string | null
          dba_country?: string | null
          dba_name?: string | null
          dba_state?: string | null
          dba_zip?: string | null
          federal_tax_id?: string | null
          high_ticket?: string | null
          id?: string
          legal_address_line1?: string | null
          legal_address_line2?: string | null
          legal_city?: string | null
          legal_country?: string | null
          legal_entity_name?: string | null
          legal_state?: string | null
          legal_zip?: string | null
          monthly_volume?: string | null
          nature_of_business?: string | null
          ownership_type?: string | null
          percent_b2b?: string | null
          percent_b2c?: string | null
          percent_ecommerce?: string | null
          percent_keyed?: string | null
          percent_moto?: string | null
          percent_swiped?: string | null
          product_description?: string | null
          referrer_id?: string | null
          sic_mcc_code?: string | null
          state_incorporated?: string | null
          tax_exempt?: boolean | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          account_id: string | null
          contact_id: string | null
          content: string | null
          created_at: string
          direction: string
          from_number: string | null
          id: string
          media_urls: string[] | null
          opportunity_id: string | null
          phone_number: string | null
          quo_message_id: string | null
          quo_phone_number_id: string | null
          status: string
          to_numbers: string[] | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          from_number?: string | null
          id?: string
          media_urls?: string[] | null
          opportunity_id?: string | null
          phone_number?: string | null
          quo_message_id?: string | null
          quo_phone_number_id?: string | null
          status?: string
          to_numbers?: string[] | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          from_number?: string | null
          id?: string
          media_urls?: string[] | null
          opportunity_id?: string | null
          phone_number?: string | null
          quo_message_id?: string | null
          quo_phone_number_id?: string | null
          status?: string
          to_numbers?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          message_type: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          message_type: string
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          message_type?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      nmi_boarding_submissions: {
        Row: {
          account_id: string | null
          account_number_last4: string | null
          account_type: string | null
          address1: string
          address2: string | null
          bank_name: string | null
          city: string
          company_name: string
          country: string
          created_at: string
          dba_name: string | null
          email: string
          error_message: string | null
          first_name: string
          id: string
          language: string
          last_name: string
          merchant_type: string
          nmi_gateway_id: string | null
          nmi_response: Json | null
          nmi_status: string
          opportunity_id: string | null
          phone: string
          routing_number_last4: string | null
          state: string
          submitted_by: string
          submitted_by_email: string
          timezone: string
          updated_at: string
          username: string
          website_url: string | null
          zip: string
        }
        Insert: {
          account_id?: string | null
          account_number_last4?: string | null
          account_type?: string | null
          address1: string
          address2?: string | null
          bank_name?: string | null
          city: string
          company_name: string
          country?: string
          created_at?: string
          dba_name?: string | null
          email: string
          error_message?: string | null
          first_name: string
          id?: string
          language?: string
          last_name: string
          merchant_type?: string
          nmi_gateway_id?: string | null
          nmi_response?: Json | null
          nmi_status?: string
          opportunity_id?: string | null
          phone: string
          routing_number_last4?: string | null
          state: string
          submitted_by: string
          submitted_by_email: string
          timezone?: string
          updated_at?: string
          username: string
          website_url?: string | null
          zip: string
        }
        Update: {
          account_id?: string | null
          account_number_last4?: string | null
          account_type?: string | null
          address1?: string
          address2?: string | null
          bank_name?: string | null
          city?: string
          company_name?: string
          country?: string
          created_at?: string
          dba_name?: string | null
          email?: string
          error_message?: string | null
          first_name?: string
          id?: string
          language?: string
          last_name?: string
          merchant_type?: string
          nmi_gateway_id?: string | null
          nmi_response?: Json | null
          nmi_status?: string
          opportunity_id?: string | null
          phone?: string
          routing_number_last4?: string | null
          state?: string
          submitted_by?: string
          submitted_by_email?: string
          timezone?: string
          updated_at?: string
          username?: string
          website_url?: string | null
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "nmi_boarding_submissions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nmi_boarding_submissions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      nmi_partner_residuals: {
        Row: {
          account_id: string | null
          assessments: number | null
          company_name: string | null
          created_at: string
          gateway_fees: number | null
          gross_volume: number | null
          id: string
          interchange_cost: number | null
          nmi_merchant_id: string
          partner_residual: number | null
          period_month: string
          processor_fees: number | null
          raw: Json | null
          synced_at: string
          transaction_count: number | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assessments?: number | null
          company_name?: string | null
          created_at?: string
          gateway_fees?: number | null
          gross_volume?: number | null
          id?: string
          interchange_cost?: number | null
          nmi_merchant_id: string
          partner_residual?: number | null
          period_month: string
          processor_fees?: number | null
          raw?: Json | null
          synced_at?: string
          transaction_count?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assessments?: number | null
          company_name?: string | null
          created_at?: string
          gateway_fees?: number | null
          gross_volume?: number | null
          id?: string
          interchange_cost?: number | null
          nmi_merchant_id?: string
          partner_residual?: number | null
          period_month?: string
          processor_fees?: number | null
          raw?: Json | null
          synced_at?: string
          transaction_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nmi_partner_residuals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      office_avatars: {
        Row: {
          created_at: string
          desk_x: number
          desk_z: number
          email: string
          hair_color: number
          hairstyle: string | null
          name: string
          scale: number
          shirt_color: number
          skin_color: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desk_x: number
          desk_z: number
          email: string
          hair_color?: number
          hairstyle?: string | null
          name: string
          scale?: number
          shirt_color: number
          skin_color?: number
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desk_x?: number
          desk_z?: number
          email?: string
          hair_color?: number
          hairstyle?: string | null
          name?: string
          scale?: number
          shirt_color?: number
          skin_color?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_wizard_states: {
        Row: {
          created_at: string
          form_state: Json
          id: string
          opportunity_id: string
          progress: number
          step_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_state?: Json
          id?: string
          opportunity_id: string
          progress?: number
          step_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_state?: Json
          id?: string
          opportunity_id?: string
          progress?: number
          step_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_wizard_states_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string
          adverse_action_sent_at: string | null
          agree_to_terms: boolean | null
          assigned_to: string | null
          contact_id: string
          created_at: string
          gateway_tier: string | null
          id: string
          language: string | null
          lead_referrer_id: string | null
          outcome_closed_at: string | null
          outcome_closed_by: string | null
          outcome_notes: string | null
          outcome_reason: string | null
          outcome_status: string | null
          portal_merchant_id: string | null
          pricing_plan: string | null
          processing_services: string[] | null
          referral_source: string | null
          referrer_id: string | null
          service_type: string | null
          sla_status: string | null
          source: string | null
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
          adverse_action_sent_at?: string | null
          agree_to_terms?: boolean | null
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          gateway_tier?: string | null
          id?: string
          language?: string | null
          lead_referrer_id?: string | null
          outcome_closed_at?: string | null
          outcome_closed_by?: string | null
          outcome_notes?: string | null
          outcome_reason?: string | null
          outcome_status?: string | null
          portal_merchant_id?: string | null
          pricing_plan?: string | null
          processing_services?: string[] | null
          referral_source?: string | null
          referrer_id?: string | null
          service_type?: string | null
          sla_status?: string | null
          source?: string | null
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
          adverse_action_sent_at?: string | null
          agree_to_terms?: boolean | null
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          gateway_tier?: string | null
          id?: string
          language?: string | null
          lead_referrer_id?: string | null
          outcome_closed_at?: string | null
          outcome_closed_by?: string | null
          outcome_notes?: string | null
          outcome_reason?: string | null
          outcome_status?: string | null
          portal_merchant_id?: string | null
          pricing_plan?: string | null
          processing_services?: string[] | null
          referral_source?: string | null
          referrer_id?: string | null
          service_type?: string | null
          sla_status?: string | null
          source?: string | null
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
          {
            foreignKeyName: "opportunities_lead_referrer_id_fkey"
            columns: ["lead_referrer_id"]
            isOneToOne: false
            referencedRelation: "lead_referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          body_html: string
          bounced_count: number
          converted_count: number
          created_at: string
          created_by: string
          created_by_email: string
          from_email: string
          from_name: string
          id: string
          name: string
          replied_count: number
          scheduled_at: string | null
          sent_count: number
          status: string
          subject: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          body_html: string
          bounced_count?: number
          converted_count?: number
          created_at?: string
          created_by: string
          created_by_email: string
          from_email?: string
          from_name?: string
          id?: string
          name: string
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          body_html?: string
          bounced_count?: number
          converted_count?: number
          created_at?: string
          created_by?: string
          created_by_email?: string
          from_email?: string
          from_name?: string
          id?: string
          name?: string
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: []
      }
      outreach_contacts: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: string
          company: string | null
          converted_at: string | null
          created_at: string
          current_step: number
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          last_step_sent_at: string | null
          opportunity_id: string | null
          replied_at: string | null
          reply_snippet: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id: string
          company?: string | null
          converted_at?: string | null
          created_at?: string
          current_step?: number
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_step_sent_at?: string | null
          opportunity_id?: string | null
          replied_at?: string | null
          reply_snippet?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string
          company?: string | null
          converted_at?: string | null
          created_at?: string
          current_step?: number
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_step_sent_at?: string | null
          opportunity_id?: string | null
          replied_at?: string | null
          reply_snippet?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contacts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      principals: {
        Row: {
          application_id: string
          created_at: string
          date_of_birth: string | null
          id: string
          ownership_percent: number | null
          principal_address_line1: string | null
          principal_address_line2: string | null
          principal_city: string | null
          principal_country: string | null
          principal_email: string | null
          principal_first_name: string | null
          principal_last_name: string | null
          principal_phone: string | null
          principal_state: string | null
          principal_title: string | null
          principal_zip: string | null
          ssn_last4: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          ownership_percent?: number | null
          principal_address_line1?: string | null
          principal_address_line2?: string | null
          principal_city?: string | null
          principal_country?: string | null
          principal_email?: string | null
          principal_first_name?: string | null
          principal_last_name?: string | null
          principal_phone?: string | null
          principal_state?: string | null
          principal_title?: string | null
          principal_zip?: string | null
          ssn_last4?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          ownership_percent?: number | null
          principal_address_line1?: string | null
          principal_address_line2?: string | null
          principal_city?: string | null
          principal_country?: string | null
          principal_email?: string | null
          principal_first_name?: string | null
          principal_last_name?: string | null
          principal_phone?: string | null
          principal_state?: string | null
          principal_title?: string | null
          principal_zip?: string | null
          ssn_last4?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "principals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
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
          home_layout: string
          id: string
          last_seen: string | null
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_layout?: string
          id: string
          last_seen?: string | null
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_layout?: string
          id?: string
          last_seen?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_acceptances: {
        Row: {
          accepted_at: string
          ach_account_holder: string | null
          ach_account_last4: string | null
          ach_account_type: string | null
          ach_authorized: boolean
          ach_bank_name: string | null
          ach_routing_last4: string | null
          agreed_to_msa: boolean
          authority_to_bind: boolean
          created_at: string
          fee_schedule_hash: string | null
          id: string
          ip_address: unknown
          notes: string | null
          quote_id: string
          signatory_email: string
          signatory_name: string
          signatory_title: string | null
          terms_version: string | null
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          ach_account_holder?: string | null
          ach_account_last4?: string | null
          ach_account_type?: string | null
          ach_authorized?: boolean
          ach_bank_name?: string | null
          ach_routing_last4?: string | null
          agreed_to_msa?: boolean
          authority_to_bind?: boolean
          created_at?: string
          fee_schedule_hash?: string | null
          id?: string
          ip_address?: unknown
          notes?: string | null
          quote_id: string
          signatory_email: string
          signatory_name: string
          signatory_title?: string | null
          terms_version?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          ach_account_holder?: string | null
          ach_account_last4?: string | null
          ach_account_type?: string | null
          ach_authorized?: boolean
          ach_bank_name?: string | null
          ach_routing_last4?: string | null
          agreed_to_msa?: boolean
          authority_to_bind?: boolean
          created_at?: string
          fee_schedule_hash?: string | null
          id?: string
          ip_address?: unknown
          notes?: string | null
          quote_id?: string
          signatory_email?: string
          signatory_name?: string
          signatory_title?: string | null
          terms_version?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_acceptances_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quote_acceptance_summary"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_acceptances_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          acceptance_token: string | null
          acceptance_token_expires_at: string | null
          accepted_at: string | null
          account_id: string | null
          annual_resale: number
          billing_cycle: string
          client_average_ticket: string | null
          client_business_name: string | null
          client_contact_name: string | null
          client_email: string | null
          client_monthly_volume: string | null
          client_notes: string | null
          client_phone: string | null
          contact_id: string | null
          created_at: string
          extras_snapshot: Json
          id: string
          lines_snapshot: Json
          monthly_cost: number
          monthly_margin: number
          monthly_resale: number
          opportunity_id: string | null
          pdf_filename: string | null
          quote_number: string
          rejected_at: string | null
          sender_company: string | null
          sender_email: string | null
          sender_name: string | null
          sender_phone: string | null
          sender_title: string | null
          sent_at: string | null
          sent_by: string | null
          sent_by_email: string | null
          status: string
          tier_id: string
          tier_name: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          acceptance_token?: string | null
          acceptance_token_expires_at?: string | null
          accepted_at?: string | null
          account_id?: string | null
          annual_resale?: number
          billing_cycle?: string
          client_average_ticket?: string | null
          client_business_name?: string | null
          client_contact_name?: string | null
          client_email?: string | null
          client_monthly_volume?: string | null
          client_notes?: string | null
          client_phone?: string | null
          contact_id?: string | null
          created_at?: string
          extras_snapshot?: Json
          id?: string
          lines_snapshot?: Json
          monthly_cost?: number
          monthly_margin?: number
          monthly_resale?: number
          opportunity_id?: string | null
          pdf_filename?: string | null
          quote_number: string
          rejected_at?: string | null
          sender_company?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_title?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
          tier_id: string
          tier_name: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          acceptance_token?: string | null
          acceptance_token_expires_at?: string | null
          accepted_at?: string | null
          account_id?: string | null
          annual_resale?: number
          billing_cycle?: string
          client_average_ticket?: string | null
          client_business_name?: string | null
          client_contact_name?: string | null
          client_email?: string | null
          client_monthly_volume?: string | null
          client_notes?: string | null
          client_phone?: string | null
          contact_id?: string | null
          created_at?: string
          extras_snapshot?: Json
          id?: string
          lines_snapshot?: Json
          monthly_cost?: number
          monthly_margin?: number
          monthly_resale?: number
          opportunity_id?: string | null
          pdf_filename?: string | null
          quote_number?: string
          rejected_at?: string | null
          sender_company?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_title?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
          tier_id?: string
          tier_name?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          created_at: string
          endpoint: string
          id: number
          ip: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: number
          ip: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      referrer_impersonation_logs: {
        Row: {
          admin_email: string
          admin_user_id: string
          created_at: string
          id: string
          referrer_email: string
          referrer_id: string
        }
        Insert: {
          admin_email: string
          admin_user_id: string
          created_at?: string
          id?: string
          referrer_email: string
          referrer_id: string
        }
        Update: {
          admin_email?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          referrer_email?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrer_impersonation_logs_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          active: boolean
          alias: string | null
          auth_user_id: string | null
          bonus_amount: number
          bonus_milestone_count: number
          clawback_window_days: number
          commission_rate: number
          created_at: string
          email: string
          full_name: string
          id: string
          monthly_cap_per_merchant: number
          notes: string | null
          phone: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          alias?: string | null
          auth_user_id?: string | null
          bonus_amount?: number
          bonus_milestone_count?: number
          clawback_window_days?: number
          commission_rate?: number
          created_at?: string
          email: string
          full_name: string
          id?: string
          monthly_cap_per_merchant?: number
          notes?: string | null
          phone?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          alias?: string | null
          auth_user_id?: string | null
          bonus_amount?: number
          bonus_milestone_count?: number
          clawback_window_days?: number
          commission_rate?: number
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          monthly_cap_per_merchant?: number
          notes?: string | null
          phone?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      scoping_submissions: {
        Row: {
          account_id: string | null
          accounting_system: string | null
          acknowledgement_name: string
          acknowledgement_title: string | null
          additional_notes: string | null
          assigned_to: string | null
          average_ticket: string | null
          budget_expectation: string | null
          business_address_line1: string | null
          business_city: string | null
          business_state: string | null
          business_zip: string | null
          channel_mix: string[] | null
          channel_split_notes: string | null
          chargeback_count_12mo: string | null
          chargeback_management_provider: string | null
          chargeback_ratio: string | null
          client_ip: string | null
          contact_email: string
          contact_first_name: string
          contact_id: string | null
          contact_last_name: string
          contact_phone: string
          contact_title: string | null
          contract_end_date: string | null
          created_at: string
          crm_or_erp: string | null
          currency_geography: string[] | null
          current_effective_rate: string | null
          current_processor: string | null
          currently_processing: string | null
          data_collected: string[] | null
          dba_name: string | null
          decision_makers: string[] | null
          deposit_structure: string | null
          disclosures_accepted: boolean
          employee_count: string | null
          entity_type: string | null
          estimated_mcc: string | null
          existing_fraud_tooling: string | null
          first_response_at: string | null
          foreign_ownership: string | null
          fulfilment_timeframe: string | null
          funding_timeline: string | null
          gateway_capabilities: string[] | null
          hard_deadline_reason: string | null
          has_developer_resource: string | null
          highest_ticket: string | null
          id: string
          industry_vertical: string | null
          integration_route: string[] | null
          legal_business_name: string
          location_mid_count: string | null
          monthly_transaction_count: string | null
          monthly_volume: string | null
          opportunity_id: string | null
          other_providers_evaluated: string | null
          payment_methods: string[] | null
          pci_status: string | null
          prior_terminations: string | null
          process_stage: string | null
          product_description: string
          projected_volume_12mo: string | null
          reconciliation_owner: string | null
          refund_policy_summary: string | null
          reporting_frequency: string | null
          reporting_requirements: string | null
          restricted_verticals: string[] | null
          seasonal_peak_months: string | null
          state_of_incorporation: string | null
          status: string
          storefront_platform: string | null
          target_go_live_date: string | null
          technical_contact_email: string | null
          technical_contact_name: string | null
          terminal_count: string | null
          typical_refund_rate: string | null
          unusual_flow_notes: string | null
          updated_at: string
          user_agent: string | null
          utm: Json | null
          website_url: string | null
          years_in_operation: string | null
        }
        Insert: {
          account_id?: string | null
          accounting_system?: string | null
          acknowledgement_name: string
          acknowledgement_title?: string | null
          additional_notes?: string | null
          assigned_to?: string | null
          average_ticket?: string | null
          budget_expectation?: string | null
          business_address_line1?: string | null
          business_city?: string | null
          business_state?: string | null
          business_zip?: string | null
          channel_mix?: string[] | null
          channel_split_notes?: string | null
          chargeback_count_12mo?: string | null
          chargeback_management_provider?: string | null
          chargeback_ratio?: string | null
          client_ip?: string | null
          contact_email: string
          contact_first_name: string
          contact_id?: string | null
          contact_last_name: string
          contact_phone: string
          contact_title?: string | null
          contract_end_date?: string | null
          created_at?: string
          crm_or_erp?: string | null
          currency_geography?: string[] | null
          current_effective_rate?: string | null
          current_processor?: string | null
          currently_processing?: string | null
          data_collected?: string[] | null
          dba_name?: string | null
          decision_makers?: string[] | null
          deposit_structure?: string | null
          disclosures_accepted?: boolean
          employee_count?: string | null
          entity_type?: string | null
          estimated_mcc?: string | null
          existing_fraud_tooling?: string | null
          first_response_at?: string | null
          foreign_ownership?: string | null
          fulfilment_timeframe?: string | null
          funding_timeline?: string | null
          gateway_capabilities?: string[] | null
          hard_deadline_reason?: string | null
          has_developer_resource?: string | null
          highest_ticket?: string | null
          id?: string
          industry_vertical?: string | null
          integration_route?: string[] | null
          legal_business_name: string
          location_mid_count?: string | null
          monthly_transaction_count?: string | null
          monthly_volume?: string | null
          opportunity_id?: string | null
          other_providers_evaluated?: string | null
          payment_methods?: string[] | null
          pci_status?: string | null
          prior_terminations?: string | null
          process_stage?: string | null
          product_description: string
          projected_volume_12mo?: string | null
          reconciliation_owner?: string | null
          refund_policy_summary?: string | null
          reporting_frequency?: string | null
          reporting_requirements?: string | null
          restricted_verticals?: string[] | null
          seasonal_peak_months?: string | null
          state_of_incorporation?: string | null
          status?: string
          storefront_platform?: string | null
          target_go_live_date?: string | null
          technical_contact_email?: string | null
          technical_contact_name?: string | null
          terminal_count?: string | null
          typical_refund_rate?: string | null
          unusual_flow_notes?: string | null
          updated_at?: string
          user_agent?: string | null
          utm?: Json | null
          website_url?: string | null
          years_in_operation?: string | null
        }
        Update: {
          account_id?: string | null
          accounting_system?: string | null
          acknowledgement_name?: string
          acknowledgement_title?: string | null
          additional_notes?: string | null
          assigned_to?: string | null
          average_ticket?: string | null
          budget_expectation?: string | null
          business_address_line1?: string | null
          business_city?: string | null
          business_state?: string | null
          business_zip?: string | null
          channel_mix?: string[] | null
          channel_split_notes?: string | null
          chargeback_count_12mo?: string | null
          chargeback_management_provider?: string | null
          chargeback_ratio?: string | null
          client_ip?: string | null
          contact_email?: string
          contact_first_name?: string
          contact_id?: string | null
          contact_last_name?: string
          contact_phone?: string
          contact_title?: string | null
          contract_end_date?: string | null
          created_at?: string
          crm_or_erp?: string | null
          currency_geography?: string[] | null
          current_effective_rate?: string | null
          current_processor?: string | null
          currently_processing?: string | null
          data_collected?: string[] | null
          dba_name?: string | null
          decision_makers?: string[] | null
          deposit_structure?: string | null
          disclosures_accepted?: boolean
          employee_count?: string | null
          entity_type?: string | null
          estimated_mcc?: string | null
          existing_fraud_tooling?: string | null
          first_response_at?: string | null
          foreign_ownership?: string | null
          fulfilment_timeframe?: string | null
          funding_timeline?: string | null
          gateway_capabilities?: string[] | null
          hard_deadline_reason?: string | null
          has_developer_resource?: string | null
          highest_ticket?: string | null
          id?: string
          industry_vertical?: string | null
          integration_route?: string[] | null
          legal_business_name?: string
          location_mid_count?: string | null
          monthly_transaction_count?: string | null
          monthly_volume?: string | null
          opportunity_id?: string | null
          other_providers_evaluated?: string | null
          payment_methods?: string[] | null
          pci_status?: string | null
          prior_terminations?: string | null
          process_stage?: string | null
          product_description?: string
          projected_volume_12mo?: string | null
          reconciliation_owner?: string | null
          refund_policy_summary?: string | null
          reporting_frequency?: string | null
          reporting_requirements?: string | null
          restricted_verticals?: string[] | null
          seasonal_peak_months?: string | null
          state_of_incorporation?: string | null
          status?: string
          storefront_platform?: string | null
          target_go_live_date?: string | null
          technical_contact_email?: string | null
          technical_contact_name?: string | null
          terminal_count?: string | null
          typical_refund_rate?: string | null
          unusual_flow_notes?: string | null
          updated_at?: string
          user_agent?: string | null
          utm?: Json | null
          website_url?: string | null
          years_in_operation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scoping_submissions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoping_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_todos: {
        Row: {
          completed_at: string | null
          completed_by_email: string | null
          created_at: string
          created_by_email: string | null
          id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by_email?: string | null
          created_at?: string
          created_by_email?: string | null
          id?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by_email?: string | null
          created_at?: string
          created_by_email?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      sop_change_requests: {
        Row: {
          created_at: string
          id: string
          original_content: string | null
          proposed_content: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          section_id: string
          section_title: string
          status: string
          submitted_by: string
          submitted_by_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_content?: string | null
          proposed_content: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id: string
          section_title: string
          status?: string
          submitted_by: string
          submitted_by_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          original_content?: string | null
          proposed_content?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string
          section_title?: string
          status?: string
          submitted_by?: string
          submitted_by_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          account_id: string | null
          archived_at: string | null
          assigned_to: string | null
          assigned_to_email: string | null
          assigned_to_name: string | null
          category: string
          claimed_at: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          priority: string
          requester_email: string
          requester_name: string | null
          source: string
          status: string
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_to_email?: string | null
          assigned_to_name?: string | null
          category?: string
          claimed_at?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          priority?: string
          requester_email: string
          requester_name?: string | null
          source?: string
          status?: string
          subject: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_to_email?: string | null
          assigned_to_name?: string | null
          category?: string
          claimed_at?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          priority?: string
          requester_email?: string
          requester_name?: string | null
          source?: string
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      synced_emails: {
        Row: {
          activity_created: boolean | null
          attachment_count: number | null
          attachment_names: string[] | null
          body_text: string | null
          cc_emails: string[] | null
          created_at: string | null
          from_email: string | null
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          has_attachments: boolean | null
          id: string
          lead_created: boolean | null
          matched_account_id: string | null
          matched_contact_id: string | null
          matched_opportunity_id: string | null
          received_at: string | null
          snippet: string | null
          subject: string | null
          synced_at: string | null
          to_emails: string[] | null
          user_email: string
        }
        Insert: {
          activity_created?: boolean | null
          attachment_count?: number | null
          attachment_names?: string[] | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          has_attachments?: boolean | null
          id?: string
          lead_created?: boolean | null
          matched_account_id?: string | null
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          synced_at?: string | null
          to_emails?: string[] | null
          user_email: string
        }
        Update: {
          activity_created?: boolean | null
          attachment_count?: number | null
          attachment_names?: string[] | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          has_attachments?: boolean | null
          id?: string
          lead_created?: boolean | null
          matched_account_id?: string | null
          matched_contact_id?: string | null
          matched_opportunity_id?: string | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          synced_at?: string | null
          to_emails?: string[] | null
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_emails_matched_account_id_fkey"
            columns: ["matched_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_emails_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_emails_matched_opportunity_id_fkey"
            columns: ["matched_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          priority: string | null
          related_contact_id: string | null
          related_opportunity_id: string | null
          source: string | null
          status: string
          title: string
        }
        Insert: {
          assignee?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string | null
          related_contact_id?: string | null
          related_opportunity_id?: string | null
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          assignee?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string | null
          related_contact_id?: string | null
          related_opportunity_id?: string | null
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_opportunity_id_fkey"
            columns: ["related_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roster: {
        Row: {
          active: boolean
          aliases: string[] | null
          color_token: string | null
          display_name: string
          email: string
          id: string
          is_external: boolean
          legacy_names: string[] | null
          sort_order: number
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          aliases?: string[] | null
          color_token?: string | null
          display_name: string
          email: string
          id: string
          is_external?: boolean
          legacy_names?: string[] | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          aliases?: string[] | null
          color_token?: string | null
          display_name?: string
          email?: string
          id?: string
          is_external?: boolean
          legacy_names?: string[] | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      terminal_updates: {
        Row: {
          created_at: string
          description: string
          icon_name: string
          id: string
          published_date: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          icon_name?: string
          id?: string
          published_date?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          icon_name?: string
          id?: string
          published_date?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          id: string
          shortcut_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shortcut_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shortcut_url?: string
          user_id?: string
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
      user_sessions: {
        Row: {
          duration_minutes: number | null
          id: string
          logged_in_at: string
          logged_out_at: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          logged_in_at?: string
          logged_out_at?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          logged_in_at?: string
          logged_out_at?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      validation_reports: {
        Row: {
          classification_issues: Json
          confidence: string | null
          created_at: string
          data_gaps: Json
          document_completeness: Json
          id: string
          no_change: boolean
          opportunity_id: string
          readiness_score: string
          recommendation: string | null
          recommended_actions: Json
          risk_flags: Json
          risk_tier: string | null
          score: number | null
          summary: string | null
          triggered_by: string
          website_score: number | null
        }
        Insert: {
          classification_issues?: Json
          confidence?: string | null
          created_at?: string
          data_gaps?: Json
          document_completeness?: Json
          id?: string
          no_change?: boolean
          opportunity_id: string
          readiness_score?: string
          recommendation?: string | null
          recommended_actions?: Json
          risk_flags?: Json
          risk_tier?: string | null
          score?: number | null
          summary?: string | null
          triggered_by: string
          website_score?: number | null
        }
        Update: {
          classification_issues?: Json
          confidence?: string | null
          created_at?: string
          data_gaps?: Json
          document_completeness?: Json
          id?: string
          no_change?: boolean
          opportunity_id?: string
          readiness_score?: string
          recommendation?: string | null
          recommended_actions?: Json
          risk_flags?: Json
          risk_tier?: string | null
          score?: number | null
          summary?: string | null
          triggered_by?: string
          website_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_reports_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      website_scrutiny_reports: {
        Row: {
          created_at: string
          id: string
          no_change: boolean
          opportunity_id: string
          recommendations: Json
          red_flags: Json
          requirements_met: Json
          score: number
          score_label: string
          summary: string | null
          triggered_by: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          no_change?: boolean
          opportunity_id: string
          recommendations?: Json
          red_flags?: Json
          requirements_met?: Json
          score?: number
          score_label?: string
          summary?: string | null
          triggered_by?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          no_change?: boolean
          opportunity_id?: string
          recommendations?: Json
          red_flags?: Json
          requirements_met?: Json
          score?: number
          score_label?: string
          summary?: string | null
          triggered_by?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_scrutiny_reports_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      quote_acceptance_summary: {
        Row: {
          acceptance_id: string | null
          accepted_at: string | null
          account_id: string | null
          ach_authorized: boolean | null
          client_business_name: string | null
          contact_id: string | null
          fee_schedule_hash: string | null
          ip_address: unknown
          opportunity_id: string | null
          quote_id: string | null
          quote_number: string | null
          sender_email: string | null
          signatory_email: string | null
          signatory_name: string | null
          signatory_title: string | null
          status: string | null
          terms_version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      referrer_commission_records: {
        Row: {
          account_id: string | null
          at_cap: boolean | null
          commission_rate: number | null
          company_commission: number | null
          company_name: string | null
          monthly_cap_per_merchant: number | null
          payout: number | null
          period_end: string | null
          period_id: string | null
          period_start: string | null
          record_id: string | null
          referrer_id: string | null
          transaction_count: number | null
          transaction_volume: number | null
          uncapped_payout: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archive_stale_closed_tickets: { Args: never; Returns: number }
      current_referrer_id: { Args: never; Returns: string }
      current_user_email: { Args: never; Returns: string }
      ensure_office_avatar: {
        Args: { p_email: string }
        Returns: {
          created_at: string
          desk_x: number
          desk_z: number
          email: string
          hair_color: number
          hairstyle: string | null
          name: string
          scale: number
          shirt_color: number
          skin_color: number
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "office_avatars"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_general_channel: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_email: { Args: never; Returns: boolean }
      is_blocked_recipient: { Args: { _email: string }; Returns: boolean }
      is_internal_staff: { Args: never; Returns: boolean }
      is_merchanthaus_staff: { Args: never; Returns: boolean }
      is_referrer: { Args: never; Returns: boolean }
      link_opportunity_to_referrer: {
        Args: { p_application_email: string; p_opportunity_id: string }
        Returns: undefined
      }
      next_billing_doc_number: {
        Args: { p_doc_type: string; p_year: number }
        Returns: string
      }
      post_system_chat_message: {
        Args: { p_channel_name?: string; p_content: string }
        Returns: undefined
      }
      prune_client_errors: { Args: never; Returns: undefined }
      prune_rate_limit_events: { Args: never; Returns: undefined }
      referrer_owns: { Args: { _referrer_id: string }; Returns: boolean }
      referrer_owns_account: { Args: { _account_id: string }; Returns: boolean }
      resolve_assignee_email: { Args: { input: string }; Returns: string }
      send_system_dm: {
        Args: { p_content: string; p_receiver_email: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "staff" | "finance"
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
      app_role: ["admin", "user", "staff", "finance"],
    },
  },
} as const
