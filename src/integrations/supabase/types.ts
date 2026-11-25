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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      notifications: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          priority: string
          dedupe_key: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body?: string | null
          link?: string | null
          priority?: string
          dedupe_key?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          priority?: string
          dedupe_key?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_campaigns: {
        Row: {
          agent_id: string | null
          agent_variables: Json
          allowed_days: string[]
          allowed_end_time: string
          allowed_start_time: string
          attempts_per_second: number
          audience: string | null
          consent_confirmed: boolean
          contact_ids: string[] | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          last_error: string | null
          launched_at: string | null
          max_retries: number
          name: string
          notes: string | null
          organization_id: string
          project_id: string | null
          retry_interval_minutes: number
          sarvam_campaign_id: string | null
          sarvam_cohort_ids: string[]
          source: string
          starts_at: string | null
          status: string
          target_count: number
          timezone: string
          updated_at: string
          webhook_token_hash: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_variables?: Json
          allowed_days?: string[]
          allowed_end_time?: string
          allowed_start_time?: string
          attempts_per_second?: number
          audience?: string | null
          consent_confirmed?: boolean
          contact_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          last_error?: string | null
          launched_at?: string | null
          max_retries?: number
          name: string
          notes?: string | null
          organization_id: string
          project_id?: string | null
          retry_interval_minutes?: number
          sarvam_campaign_id?: string | null
          sarvam_cohort_ids?: string[]
          source?: string
          starts_at?: string | null
          status?: string
          target_count?: number
          timezone?: string
          updated_at?: string
          webhook_token_hash?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_variables?: Json
          allowed_days?: string[]
          allowed_end_time?: string
          allowed_start_time?: string
          attempts_per_second?: number
          audience?: string | null
          consent_confirmed?: boolean
          contact_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          last_error?: string | null
          launched_at?: string | null
          max_retries?: number
          name?: string
          notes?: string | null
          organization_id?: string
          project_id?: string | null
          retry_interval_minutes?: number
          sarvam_campaign_id?: string | null
          sarvam_cohort_ids?: string[]
          source?: string
          starts_at?: string | null
          status?: string
          target_count?: number
          timezone?: string
          updated_at?: string
          webhook_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          answers: Json
          campaign_id: string | null
          campaign_target_id: string | null
          contact_id: string | null
          created_at: string
          crm_synced_at: string | null
          direction: string
          duration_seconds: number
          ended_at: string | null
          external_id: string | null
          id: string
          is_test_call: boolean
          organization_id: string
          outcome: string | null
          phone: string | null
          recording_path: string | null
          recording_url: string | null
          retry_attempt: number
          sarvam_campaign_id: string | null
          sarvam_failure_reason: string | null
          sarvam_interaction_id: string | null
          sarvam_status: string | null
          sentiment: string | null
          started_at: string | null
          status: string
          summary: string | null
          transcript: string | null
          transcript_turns: Json | null
          updated_at: string
          webhook_token_hash: string | null
        }
        Insert: {
          agent_id?: string | null
          answers?: Json
          campaign_id?: string | null
          campaign_target_id?: string | null
          contact_id?: string | null
          created_at?: string
          crm_synced_at?: string | null
          direction?: string
          duration_seconds?: number
          ended_at?: string | null
          external_id?: string | null
          id?: string
          is_test_call?: boolean
          organization_id: string
          outcome?: string | null
          phone?: string | null
          recording_path?: string | null
          recording_url?: string | null
          retry_attempt?: number
          sarvam_campaign_id?: string | null
          sarvam_failure_reason?: string | null
          sarvam_interaction_id?: string | null
          sarvam_status?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
          transcript_turns?: Json | null
          updated_at?: string
          webhook_token_hash?: string | null
        }
        Update: {
          agent_id?: string | null
          answers?: Json
          campaign_id?: string | null
          campaign_target_id?: string | null
          contact_id?: string | null
          created_at?: string
          crm_synced_at?: string | null
          direction?: string
          duration_seconds?: number
          ended_at?: string | null
          external_id?: string | null
          id?: string
          is_test_call?: boolean
          organization_id?: string
          outcome?: string | null
          phone?: string | null
          recording_path?: string | null
          recording_url?: string | null
          retry_attempt?: number
          sarvam_campaign_id?: string | null
          sarvam_failure_reason?: string | null
          sarvam_interaction_id?: string | null
          sarvam_status?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
          transcript_turns?: Json | null
          updated_at?: string
          webhook_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_campaign_target_id_fkey"
            columns: ["campaign_target_id"]
            isOneToOne: false
            referencedRelation: "campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          answers: Json
          attempts: number
          campaign_id: string
          contact_id: string | null
          created_at: string
          id: string
          last_call_id: string | null
          last_outcome: string | null
          organization_id: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          attempts?: number
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          last_call_id?: string | null
          last_outcome?: string | null
          organization_id: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          attempts?: number
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          last_call_id?: string | null
          last_outcome?: string | null
          organization_id?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_kyc: {
        Row: {
          address_line: string | null
          call_id: string | null
          city: string | null
          consent_at: string | null
          consent_given: boolean
          contact_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string
          nominee_name: string | null
          nominee_relation: string | null
          notes: string | null
          organization_id: string
          pan_masked: string | null
          pincode: string | null
          source: string
          state: string | null
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address_line?: string | null
          call_id?: string | null
          city?: string | null
          consent_at?: string | null
          consent_given?: boolean
          contact_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          nominee_name?: string | null
          nominee_relation?: string | null
          notes?: string | null
          organization_id: string
          pan_masked?: string | null
          pincode?: string | null
          source?: string
          state?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address_line?: string | null
          call_id?: string | null
          city?: string | null
          consent_at?: string | null
          consent_given?: boolean
          contact_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          nominee_name?: string | null
          nominee_relation?: string | null
          notes?: string | null
          organization_id?: string
          pan_masked?: string | null
          pincode?: string | null
          source?: string
          state?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_kyc_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          city: string | null
          created_at: string
          id: string
          industry: string | null
          name: string
          organization_id: string
          owner_id: string | null
          phone: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          city: string | null
          company_id: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string | null
          organization_id: string
          owner_id: string | null
          phone: string | null
          project_id: string | null
          source: string | null
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          project_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
          project_id?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_state: {
        Row: {
          id: number
          last_run_at: string | null
          token_hash: string
        }
        Insert: {
          id?: number
          last_run_at?: string | null
          token_hash: string
        }
        Update: {
          id?: number
          last_run_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          expected_close: string | null
          id: string
          last_call_id: string | null
          organization_id: string
          owner_id: string | null
          probability: number
          stage: string
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expected_close?: string | null
          id?: string
          last_call_id?: string | null
          organization_id: string
          owner_id?: string | null
          probability?: number
          stage?: string
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expected_close?: string | null
          id?: string
          last_call_id?: string | null
          organization_id?: string
          owner_id?: string | null
          probability?: number
          stage?: string
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          column_mapping: Json
          created_at: string
          created_by: string | null
          errors: Json
          file_name: string
          file_path: string | null
          file_type: string
          id: string
          inserted: number
          organization_id: string
          project_id: string | null
          skipped: number
          status: string
          total_rows: number
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name: string
          file_path?: string | null
          file_type: string
          id?: string
          inserted?: number
          organization_id: string
          project_id?: string | null
          skipped?: number
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name?: string
          file_path?: string | null
          file_type?: string
          id?: string
          inserted?: number
          organization_id?: string
          project_id?: string | null
          skipped?: number
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          last_call_id: string | null
          name: string
          organization_id: string
          owner_id: string | null
          phone: string | null
          score: number
          source: string | null
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_call_id?: string | null
          name: string
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          score?: number
          source?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Update: {
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_call_id?: string | null
          name?: string
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
          score?: number
          source?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          location: string | null
          notes: string | null
          organization_id: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          notes?: string | null
          organization_id: string
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          notes?: string | null
          organization_id?: string
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          reports_to: string | null
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          reports_to?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          reports_to?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          channel: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          organization_id: string
          recipient: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          organization_id: string
          recipient?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          organization_id?: string
          recipient?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_counters: {
        Row: {
          name: string
          organization_id: string
          value: number
        }
        Insert: {
          name: string
          organization_id: string
          value?: number
        }
        Update: {
          name?: string
          organization_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_type: string | null
          country: string | null
          created_at: string
          created_by: string
          id: string
          industry: string | null
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          phone: string | null
          sarvam_organization_id: string | null
          sarvam_workspace_id: string | null
          slug: string | null
          timezone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          business_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          name: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          sarvam_organization_id?: string | null
          sarvam_workspace_id?: string | null
          slug?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          name?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          sarvam_organization_id?: string | null
          sarvam_workspace_id?: string | null
          slug?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          mode: string
          notes: string | null
          organization_id: string
          paid_on: string
          recorded_by: string | null
          reference: string | null
          sales_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mode?: string
          notes?: string | null
          organization_id: string
          paid_on?: string
          recorded_by?: string | null
          reference?: string | null
          sales_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mode?: string
          notes?: string | null
          organization_id?: string
          paid_on?: string
          recorded_by?: string | null
          reference?: string | null
          sales_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          phone: string | null
          preferred_language: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          contact_count: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_reminders: {
        Row: {
          created_at: string
          days_before: number
          id: string
          organization_id: string
          sales_order_id: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          days_before: number
          id?: string
          organization_id: string
          sales_order_id: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          days_before?: number
          id?: string
          organization_id?: string
          sales_order_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewal_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount_paid: number
          call_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          id: string
          insurer: string | null
          notes: string | null
          order_number: string
          organization_id: string
          owner_id: string | null
          payment_due_date: string | null
          payment_frequency: string
          plan_name: string | null
          policy_end_date: string | null
          policy_number: string | null
          policy_start_date: string | null
          premium_amount: number
          product_type: string
          renewed_from_order_id: string | null
          source: string
          status: string
          sum_insured: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          call_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          insurer?: string | null
          notes?: string | null
          order_number: string
          organization_id: string
          owner_id?: string | null
          payment_due_date?: string | null
          payment_frequency?: string
          plan_name?: string | null
          policy_end_date?: string | null
          policy_number?: string | null
          policy_start_date?: string | null
          premium_amount?: number
          product_type?: string
          renewed_from_order_id?: string | null
          source?: string
          status?: string
          sum_insured?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          call_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          insurer?: string | null
          notes?: string | null
          order_number?: string
          organization_id?: string
          owner_id?: string | null
          payment_due_date?: string | null
          payment_frequency?: string
          plan_name?: string | null
          policy_end_date?: string | null
          policy_number?: string | null
          policy_start_date?: string | null
          premium_amount?: number
          product_type?: string
          renewed_from_order_id?: string | null
          source?: string
          status?: string
          sum_insured?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_renewed_from_order_id_fkey"
            columns: ["renewed_from_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          due_at: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          agent_variables: Json
          created_at: string
          created_by: string | null
          greeting: string | null
          greeting_no_name: string | null
          id: string
          instructions: string | null
          language: string
          name: string
          organization_id: string
          purpose: string | null
          sarvam_agent_id: string | null
          sarvam_agent_phone_number: string | null
          sarvam_app_version: number
          sarvam_connection_id: string | null
          status: string
          updated_at: string
          voice: string | null
        }
        Insert: {
          agent_variables?: Json
          created_at?: string
          created_by?: string | null
          greeting?: string | null
          greeting_no_name?: string | null
          id?: string
          instructions?: string | null
          language?: string
          name: string
          organization_id: string
          purpose?: string | null
          sarvam_agent_id?: string | null
          sarvam_agent_phone_number?: string | null
          sarvam_app_version?: number
          sarvam_connection_id?: string | null
          status?: string
          updated_at?: string
          voice?: string | null
        }
        Update: {
          agent_variables?: Json
          created_at?: string
          created_by?: string | null
          greeting?: string | null
          greeting_no_name?: string | null
          id?: string
          instructions?: string | null
          language?: string
          name?: string
          organization_id?: string
          purpose?: string | null
          sarvam_agent_id?: string | null
          sarvam_agent_phone_number?: string | null
          sarvam_app_version?: number
          sarvam_connection_id?: string | null
          status?: string
          updated_at?: string
          voice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          call_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          error: string | null
          event: string
          id: string
          matched: boolean
          organization_id: string
          results: Json
          status: string
          workflow_id: string | null
        }
        Insert: {
          call_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error?: string | null
          event: string
          id?: string
          matched?: boolean
          organization_id: string
          results?: Json
          status?: string
          workflow_id?: string | null
        }
        Update: {
          call_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          matched?: boolean
          organization_id?: string
          results?: Json
          status?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          action: string | null
          actions: Json
          campaign_id: string | null
          condition: string | null
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_run_at: string | null
          match: string
          name: string
          notes: string | null
          organization_id: string
          project_id: string | null
          run_count: number
          schedule_at: string | null
          status: string
          trigger: Json
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          actions?: Json
          campaign_id?: string | null
          condition?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_run_at?: string | null
          match?: string
          name: string
          notes?: string | null
          organization_id: string
          project_id?: string | null
          run_count?: number
          schedule_at?: string | null
          status?: string
          trigger?: Json
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          actions?: Json
          campaign_id?: string | null
          condition?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_run_at?: string | null
          match?: string
          name?: string
          notes?: string | null
          organization_id?: string
          project_id?: string | null
          run_count?: number
          schedule_at?: string | null
          status?: string
          trigger?: Json
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      can_write_org: { Args: { _org: string }; Returns: boolean }
      create_default_voice_agent: {
        Args: { _created_by: string; _org: string }
        Returns: undefined
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      next_org_counter: {
        Args: { _name: string; _org: string }
        Returns: number
      }
      queue_renewal_reminders: { Args: never; Returns: number }
      refresh_project_contact_counts: {
        Args: { _projects: string[] }
        Returns: undefined
      }
      stock_advisory_script: { Args: never; Returns: string }
      yulabs_insurance_script: { Args: never; Returns: string }
      yulabs_insurance_variables: { Args: never; Returns: Json }
    }
    Enums: {
      org_role:
        | "owner"
        | "admin"
        | "sales_manager"
        | "team_lead"
        | "sales_rep"
        | "voice_manager"
        | "support_agent"
        | "analyst"
        | "read_only"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      org_role: [
        "owner",
        "admin",
        "sales_manager",
        "team_lead",
        "sales_rep",
        "voice_manager",
        "support_agent",
        "analyst",
        "read_only",
      ],
    },
  },
} as const
