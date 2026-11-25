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
      api_keys: {
        Row: {
          id: string
          organization_id: string
          name: string
          key_prefix: string
          key_hash: string
          scopes: string[]
          purpose: string
          created_by: string | null
          last_used_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          key_prefix: string
          key_hash: string
          scopes?: string[]
          purpose?: string
          created_by?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          key_prefix?: string
          key_hash?: string
          scopes?: string[]
          purpose?: string
          created_by?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
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
      call_campaigns: {
        Row: {
          agent_id: string | null
          audience: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          starts_at: string | null
          status: string
          target_count: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          audience?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          starts_at?: string | null
          status?: string
          target_count?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          audience?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          starts_at?: string | null
          status?: string
          target_count?: number
          updated_at?: string
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
        ]
      }
      calls: {
        Row: {
          crm_synced_at: string | null
          agent_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          direction: string
          duration_seconds: number
          external_id: string | null
          id: string
          is_test_call: boolean
          organization_id: string
          outcome: string | null
          phone: string | null
          recording_url: string | null
          sarvam_failure_reason: string | null
          sarvam_interaction_id: string | null
          sarvam_status: string | null
          sentiment: string | null
          started_at: string | null
          status: string
          summary: string | null
          transcript: string | null
          updated_at: string
          webhook_token_hash: string | null
        }
        Insert: {
          crm_synced_at?: string | null
          agent_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number
          external_id?: string | null
          id?: string
          is_test_call?: boolean
          organization_id: string
          outcome?: string | null
          phone?: string | null
          recording_url?: string | null
          sarvam_failure_reason?: string | null
          sarvam_interaction_id?: string | null
          sarvam_status?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
          updated_at?: string
          webhook_token_hash?: string | null
        }
        Update: {
          crm_synced_at?: string | null
          agent_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number
          external_id?: string | null
          id?: string
          is_test_call?: boolean
          organization_id?: string
          outcome?: string | null
          phone?: string | null
          recording_url?: string | null
          sarvam_failure_reason?: string | null
          sarvam_interaction_id?: string | null
          sarvam_status?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
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
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string | null
          organization_id: string
          owner_id: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
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
        ]
      }
      deals: {
        Row: {
          last_call_id: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          expected_close: string | null
          id: string
          organization_id: string
          owner_id: string | null
          probability: number
          stage: string
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          last_call_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expected_close?: string | null
          id?: string
          organization_id: string
          owner_id?: string | null
          probability?: number
          stage?: string
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          last_call_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expected_close?: string | null
          id?: string
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
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          last_call_id: string | null
          company_name: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
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
          last_call_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
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
          last_call_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
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
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
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
          job_title: string | null
          phone: string | null
          preferred_language: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          job_title?: string | null
          phone?: string | null
          preferred_language?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          job_title?: string | null
          phone?: string | null
          preferred_language?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          created_by: string | null
          greeting: string | null
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
          created_at?: string
          created_by?: string | null
          greeting?: string | null
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
          created_at?: string
          created_by?: string | null
          greeting?: string | null
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
      workflows: {
        Row: {
          action: string | null
          condition: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          organization_id: string
          schedule_at: string | null
          status: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          organization_id: string
          schedule_at?: string | null
          status?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          organization_id?: string
          schedule_at?: string | null
          status?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
    }
    Enums: {
      org_role:
      | "owner"
      | "admin"
      | "sales_manager"
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
        "sales_rep",
        "voice_manager",
        "support_agent",
        "analyst",
        "read_only",
      ],
    },
  },
} as const
