/**
 * Auto-generated from the live Supabase schema (project jlwszvtitjtgothgxubo)
 * during the 2026-09-12 schema-drift repair, via the Supabase
 * generate_typescript_types workflow — not hand-edited.
 *
 * Not currently imported anywhere: no Supabase client in this codebase
 * is parameterized with a `Database` generic (see lib/supabase/client.ts,
 * lib/supabase/server.ts), so this file has no effect on today's
 * compile-time checking. It exists as an accurate reference for the
 * live schema and as the future canonical source if/when the
 * hand-rolled `types/app-database.types.ts` override layer is
 * consolidated — see docs/architecture.md "Database types".
 *
 * Regenerate with the same MCP-based workflow (or
 * `npx supabase gen types typescript --project-id jlwszvtitjtgothgxubo`)
 * after any future schema change.
 */
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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_audit_logs: {
        Row: {
          action: string
          created_at: string
          feature: string
          human_approved: boolean
          id: string
          metadata: Json
          model_name: string | null
          organization_id: string
          provider: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          feature: string
          human_approved?: boolean
          id?: string
          metadata?: Json
          model_name?: string | null
          organization_id: string
          provider?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          feature?: string
          human_approved?: boolean
          id?: string
          metadata?: Json
          model_name?: string | null
          organization_id?: string
          provider?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_entitlements: {
        Row: {
          active: boolean
          created_at: string
          daily_message_limit: number
          ends_at: string | null
          external_subscription_id: string | null
          plan_code: string
          source: string
          starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_message_limit?: number
          ends_at?: string | null
          external_subscription_id?: string | null
          plan_code?: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_message_limit?: number
          ends_at?: string | null
          external_subscription_id?: string | null
          plan_code?: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          rating: number
          thread_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating: number
          thread_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: number
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          evidence: Json
          id: string
          model_name: string | null
          organization_id: string
          provider: string | null
          recommendation: string | null
          severity: string
          summary: string
          title: string
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          model_name?: string | null
          organization_id: string
          provider?: string | null
          recommendation?: string | null
          severity?: string
          summary: string
          title: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          model_name?: string | null
          organization_id?: string
          provider?: string | null
          recommendation?: string | null
          severity?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          openai_response_id: string | null
          output_tokens: number | null
          role: string
          thread_id: string
          tool_calls: Json | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          openai_response_id?: string | null
          output_tokens?: number | null
          role?: string
          thread_id: string
          tool_calls?: Json | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          openai_response_id?: string | null
          output_tokens?: number | null
          role?: string
          thread_id?: string
          tool_calls?: Json | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_support_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          status: string
          subject: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          status?: string
          subject: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_support_tickets_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_thread_summaries: {
        Row: {
          covered_message_count: number
          covered_through_message_id: string | null
          created_at: string
          id: string
          model: string | null
          summary: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          covered_message_count?: number
          covered_through_message_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          summary: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          covered_message_count?: number
          covered_through_message_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          summary?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_thread_summaries_covered_through_message_id_fkey"
            columns: ["covered_through_message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_thread_summaries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          status: string | null
          thread_type: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string | null
          thread_type?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string | null
          thread_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_tool_logs: {
        Row: {
          arguments: Json
          call_id: string | null
          created_at: string
          duration_ms: number
          id: string
          result: Json
          status: string
          thread_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          arguments?: Json
          call_id?: string | null
          created_at?: string
          duration_ms?: number
          id?: string
          result?: Json
          status: string
          thread_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          arguments?: Json
          call_id?: string | null
          created_at?: string
          duration_ms?: number
          id?: string
          result?: Json
          status?: string
          thread_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_logs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: {
          created_at: string
          id: string
          input_tokens: number
          messages_used: number
          model: string | null
          output_tokens: number
          plan_code: string
          request_limit: number
          total_tokens: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number
          messages_used?: number
          model?: string | null
          output_tokens?: number
          plan_code?: string
          request_limit?: number
          total_tokens?: number
          updated_at?: string
          usage_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number
          messages_used?: number
          model?: string | null
          output_tokens?: number
          plan_code?: string
          request_limit?: number
          total_tokens?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_user_settings: {
        Row: {
          allow_conversation_memory: boolean
          created_at: string
          detail_level: string
          language: string
          preferred_tone: string
          protein_reminders_enabled: boolean
          reminder_hour_local: number
          timezone: string
          updated_at: string
          user_id: string
          weekly_summary_enabled: boolean
          workout_reminders_enabled: boolean
        }
        Insert: {
          allow_conversation_memory?: boolean
          created_at?: string
          detail_level?: string
          language?: string
          preferred_tone?: string
          protein_reminders_enabled?: boolean
          reminder_hour_local?: number
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_summary_enabled?: boolean
          workout_reminders_enabled?: boolean
        }
        Update: {
          allow_conversation_memory?: boolean
          created_at?: string
          detail_level?: string
          language?: string
          preferred_tone?: string
          protein_reminders_enabled?: boolean
          reminder_hour_local?: number
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_summary_enabled?: boolean
          workout_reminders_enabled?: boolean
        }
        Relationships: []
      }
      ai_workout_reminders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          message: string
          remind_at: string
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          message: string
          remind_at: string
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          message?: string
          remind_at?: string
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workout_reminders_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          checked_in_at: string
          id: string
          member_id: string
          organization_id: string
        }
        Insert: {
          checked_in_at?: string
          id?: string
          member_id: string
          organization_id: string
        }
        Update: {
          checked_in_at?: string
          id?: string
          member_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "gym_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          key: string
          name: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          stripe_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          joined_at: string
          membership_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          joined_at?: string
          membership_type?: string | null
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          membership_type?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_programs: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_programs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_staff: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ai_generated: boolean
          approved_at: string | null
          approved_by: string | null
          call_to_action: string | null
          created_at: string
          email_body: string | null
          email_subject: string | null
          id: string
          metrics: Json
          model_name: string | null
          name: string
          objective: string | null
          organization_id: string
          provider: string | null
          push_text: string | null
          segment_key: string | null
          social_caption: string | null
          status: string
          strategy: string | null
          updated_at: string
          visual_prompt: string | null
        }
        Insert: {
          ai_generated?: boolean
          approved_at?: string | null
          approved_by?: string | null
          call_to_action?: string | null
          created_at?: string
          email_body?: string | null
          email_subject?: string | null
          id?: string
          metrics?: Json
          model_name?: string | null
          name: string
          objective?: string | null
          organization_id: string
          provider?: string | null
          push_text?: string | null
          segment_key?: string | null
          social_caption?: string | null
          status?: string
          strategy?: string | null
          updated_at?: string
          visual_prompt?: string | null
        }
        Update: {
          ai_generated?: boolean
          approved_at?: string | null
          approved_by?: string | null
          call_to_action?: string | null
          created_at?: string
          email_body?: string | null
          email_subject?: string | null
          id?: string
          metrics?: Json
          model_name?: string | null
          name?: string
          objective?: string | null
          organization_id?: string
          provider?: string | null
          push_text?: string | null
          segment_key?: string | null
          social_caption?: string | null
          status?: string
          strategy?: string | null
          updated_at?: string
          visual_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      churn_assessments: {
        Row: {
          ai_explanation: string | null
          confidence: number | null
          created_at: string
          factors: Json
          id: string
          member_id: string
          model_name: string | null
          organization_id: string
          provider: string | null
          recommended_actions: Json
          risk_level: string
          risk_score: number
        }
        Insert: {
          ai_explanation?: string | null
          confidence?: number | null
          created_at?: string
          factors?: Json
          id?: string
          member_id: string
          model_name?: string | null
          organization_id: string
          provider?: string | null
          recommended_actions?: Json
          risk_level: string
          risk_score: number
        }
        Update: {
          ai_explanation?: string | null
          confidence?: number | null
          created_at?: string
          factors?: Json
          id?: string
          member_id?: string
          model_name?: string | null
          organization_id?: string
          provider?: string | null
          recommended_actions?: Json
          risk_level?: string
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "churn_assessments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "gym_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string
          body: string
          client_id: string
          created_at: string
          id: string
          visibility: string
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Relationships: []
      }
      client_statuses: {
        Row: {
          client_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_tags: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      coach_clients: {
        Row: {
          assigned_by: string | null
          client_id: string
          coach_id: string
          created_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          default_value: string | null
          description: string | null
          key: string
          name: string
          value_type: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          description?: string | null
          key: string
          name: string
          value_type?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          description?: string | null
          key?: string
          name?: string
          value_type?: string
        }
        Relationships: []
      }
      exercise_sets: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          reps: number | null
          rir: number | null
          set_number: number
          updated_at: string
          weight_kg: number | null
          workout_session_exercise_id: string
          workout_session_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rir?: number | null
          set_number: number
          updated_at?: string
          weight_kg?: number | null
          workout_session_exercise_id: string
          workout_session_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rir?: number | null
          set_number?: number
          updated_at?: string
          weight_kg?: number | null
          workout_session_exercise_id?: string
          workout_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_sets_workout_session_exercise_id_fkey"
            columns: ["workout_session_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_sets_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_usage: {
        Row: {
          estimated_energy_kwh: number | null
          footfall: number
          id: string
          organization_id: string
          recorded_at: string
          utilisation: number
          zone: string
        }
        Insert: {
          estimated_energy_kwh?: number | null
          footfall?: number
          id?: string
          organization_id: string
          recorded_at: string
          utilisation: number
          zone: string
        }
        Update: {
          estimated_energy_kwh?: number | null
          footfall?: number
          id?: string
          organization_id?: string
          recorded_at?: string
          utilisation?: number
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_profiles: {
        Row: {
          available_equipment: string[]
          calories_target: number | null
          carbs_target_g: number | null
          created_at: string
          experience: string | null
          fat_target_g: number | null
          goal: string | null
          height_cm: number | null
          physical_limitations: string | null
          priority_muscles: string[]
          protein_target_g: number | null
          session_duration_minutes: number | null
          training_days: number | null
          training_location: string | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          available_equipment?: string[]
          calories_target?: number | null
          carbs_target_g?: number | null
          created_at?: string
          experience?: string | null
          fat_target_g?: number | null
          goal?: string | null
          height_cm?: number | null
          physical_limitations?: string | null
          priority_muscles?: string[]
          protein_target_g?: number | null
          session_duration_minutes?: number | null
          training_days?: number | null
          training_location?: string | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          available_equipment?: string[]
          calories_target?: number | null
          carbs_target_g?: number | null
          created_at?: string
          experience?: string | null
          fat_target_g?: number | null
          goal?: string | null
          height_cm?: number | null
          physical_limitations?: string | null
          priority_muscles?: string[]
          protein_target_g?: number | null
          session_duration_minutes?: number | null
          training_days?: number | null
          training_location?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          barcode: string | null
          brand: string | null
          calories: number
          carbs_g: number
          created_at: string
          estimated_from: string | null
          estimation_confidence: string | null
          estimation_reason: string | null
          fat_g: number
          fiber_g: number | null
          food_name: string
          id: string
          is_estimated: boolean
          log_date: string
          meal_type: string
          notes: string | null
          protein_g: number
          quantity_grams: number
          source: string
          source_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories: number
          carbs_g: number
          created_at?: string
          estimated_from?: string | null
          estimation_confidence?: string | null
          estimation_reason?: string | null
          fat_g: number
          fiber_g?: number | null
          food_name: string
          id?: string
          is_estimated?: boolean
          log_date?: string
          meal_type?: string
          notes?: string | null
          protein_g: number
          quantity_grams: number
          source: string
          source_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          estimated_from?: string | null
          estimation_confidence?: string | null
          estimation_reason?: string | null
          fat_g?: number
          fiber_g?: number | null
          food_name?: string
          id?: string
          is_estimated?: boolean
          log_date?: string
          meal_type?: string
          notes?: string | null
          protein_g?: number
          quantity_grams?: number
          source?: string
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gym_members: {
        Row: {
          created_at: string
          email: string | null
          engagement_score: number
          goal: string | null
          id: string
          join_date: string | null
          last_visit_at: string | null
          membership_plan: string | null
          monthly_value: number
          name: string
          organization_id: string
          progress_signal: number
          sessions_30d: number
          sessions_previous_30d: number
          status: string
          updated_at: string
          user_id: string | null
          workout_adherence: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          engagement_score?: number
          goal?: string | null
          id?: string
          join_date?: string | null
          last_visit_at?: string | null
          membership_plan?: string | null
          monthly_value?: number
          name: string
          organization_id: string
          progress_signal?: number
          sessions_30d?: number
          sessions_previous_30d?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          workout_adherence?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          engagement_score?: number
          goal?: string | null
          id?: string
          join_date?: string | null
          last_visit_at?: string | null
          membership_plan?: string | null
          monthly_value?: number
          name?: string
          organization_id?: string
          progress_signal?: number
          sessions_30d?: number
          sessions_previous_30d?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          workout_adherence?: number
        }
        Relationships: [
          {
            foreignKeyName: "gym_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          billing_reminders: boolean
          email_enabled: boolean
          in_app_enabled: boolean
          timezone: string
          updated_at: string
          user_id: string
          workout_reminders: boolean
        }
        Insert: {
          billing_reminders?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
          workout_reminders?: boolean
        }
        Update: {
          billing_reminders?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
          workout_reminders?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_drafts: {
        Row: {
          created_at: string
          current_step: number
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_users: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          last_login_at: string | null
          onboarding_completed: boolean
          phone: string | null
          provider: string | null
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          last_login_at?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          provider?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          last_login_at?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          provider?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      recovery_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          fatigue: number | null
          id: string
          mood: number | null
          notes: string | null
          pain_illness: string
          readiness: number | null
          recovery_score: number | null
          resting_hr: number | null
          score_breakdown: Json | null
          sleep_hours: number | null
          sleep_quality: number | null
          soreness: number | null
          steps: number | null
          stress: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          fatigue?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          pain_illness?: string
          readiness?: number | null
          recovery_score?: number | null
          resting_hr?: number | null
          score_breakdown?: Json | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          steps?: number | null
          stress?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          fatigue?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          pain_illness?: string
          readiness?: number | null
          recovery_score?: number | null
          resting_hr?: number | null
          score_breakdown?: Json | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          steps?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminder_schedules: {
        Row: {
          created_at: string
          id: string
          rule_key: string
          scheduled_for: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rule_key: string
          scheduled_for: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rule_key?: string
          scheduled_for?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      role_entitlements: {
        Row: {
          created_at: string
          entitlement_key: string
          role: Database["public"]["Enums"]["app_role"]
          value: string
        }
        Insert: {
          created_at?: string
          entitlement_key: string
          role: Database["public"]["Enums"]["app_role"]
          value?: string
        }
        Update: {
          created_at?: string
          entitlement_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_entitlements_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["key"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          job_key: string
          last_error: string | null
          run_at: string
          status: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_key: string
          last_error?: string | null
          run_at: string
          status?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_key?: string
          last_error?: string | null
          run_at?: string
          status?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          billing_interval: string
          code: string
          created_at: string
          currency: string
          name: string
          price_amount: number
        }
        Insert: {
          active?: boolean
          billing_interval?: string
          code: string
          created_at?: string
          currency?: string
          name: string
          price_amount?: number
        }
        Update: {
          active?: boolean
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          name?: string
          price_amount?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan_code: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_code: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_code?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          entitlement_key: string
          id: string
          source: string
          starts_at: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          entitlement_key: string
          id?: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          entitlement_key?: string
          id?: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlements_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["key"]
          },
        ]
      }
      user_preferences: {
        Row: {
          activity_level: string | null
          activity_level_override: string | null
          allergies: string[]
          cooking_ability: string | null
          created_at: string
          daily_steps: number | null
          excluded_foods: string[]
          food_preferences: string[]
          meal_prep_frequency: string | null
          meals_per_day: number | null
          nutrition_goal: string | null
          nutrition_goal_override: string | null
          preferred_training_time: string | null
          sleep_hours: number | null
          stress_level: string | null
          training_mode: string | null
          training_mode_override: string | null
          updated_at: string
          user_id: string
          weekly_food_budget: number | null
          work_schedule: string | null
        }
        Insert: {
          activity_level?: string | null
          activity_level_override?: string | null
          allergies?: string[]
          cooking_ability?: string | null
          created_at?: string
          daily_steps?: number | null
          excluded_foods?: string[]
          food_preferences?: string[]
          meal_prep_frequency?: string | null
          meals_per_day?: number | null
          nutrition_goal?: string | null
          nutrition_goal_override?: string | null
          preferred_training_time?: string | null
          sleep_hours?: number | null
          stress_level?: string | null
          training_mode?: string | null
          training_mode_override?: string | null
          updated_at?: string
          user_id: string
          weekly_food_budget?: number | null
          work_schedule?: string | null
        }
        Update: {
          activity_level?: string | null
          activity_level_override?: string | null
          allergies?: string[]
          cooking_ability?: string | null
          created_at?: string
          daily_steps?: number | null
          excluded_foods?: string[]
          food_preferences?: string[]
          meal_prep_frequency?: string | null
          meals_per_day?: number | null
          nutrition_goal?: string | null
          nutrition_goal_override?: string | null
          preferred_training_time?: string | null
          sleep_hours?: number | null
          stress_level?: string | null
          training_mode?: string | null
          training_mode_override?: string | null
          updated_at?: string
          user_id?: string
          weekly_food_budget?: number | null
          work_schedule?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          primary_goal: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          primary_goal?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          primary_goal?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_days: {
        Row: {
          created_at: string
          day_number: number
          focus: string | null
          id: string
          name: string
          notes: string | null
          rest_day: boolean
          updated_at: string
          workout_plan_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          focus?: string | null
          id?: string
          name: string
          notes?: string | null
          rest_day?: boolean
          updated_at?: string
          workout_plan_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          focus?: string | null
          id?: string
          name?: string
          notes?: string | null
          rest_day?: boolean
          updated_at?: string
          workout_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_days_workout_plan_id_fkey"
            columns: ["workout_plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_name: string
          exercise_order: number
          id: string
          notes: string | null
          rep_max: number
          rep_min: number
          rest_seconds: number
          rir: number | null
          target_sets: number
          tempo: string | null
          updated_at: string
          workout_day_id: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_name: string
          exercise_order?: number
          id?: string
          notes?: string | null
          rep_max?: number
          rep_min?: number
          rest_seconds?: number
          rir?: number | null
          target_sets?: number
          tempo?: string | null
          updated_at?: string
          workout_day_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_name?: string
          exercise_order?: number
          id?: string
          notes?: string | null
          rep_max?: number
          rep_min?: number
          rest_seconds?: number
          rir?: number | null
          target_sets?: number
          tempo?: string | null
          updated_at?: string
          workout_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_workout_day_id_fkey"
            columns: ["workout_day_id"]
            isOneToOne: false
            referencedRelation: "workout_days"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          days_per_week: number
          description: string | null
          goal: string | null
          id: string
          name: string
          session_duration_minutes: number
          status: string
          updated_at: string
          weeks: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          days_per_week?: number
          description?: string | null
          goal?: string | null
          id?: string
          name: string
          session_duration_minutes?: number
          status?: string
          updated_at?: string
          weeks?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          days_per_week?: number
          description?: string | null
          goal?: string | null
          id?: string
          name?: string
          session_duration_minutes?: number
          status?: string
          updated_at?: string
          weeks?: number
        }
        Relationships: []
      }
      workout_session_exercises: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_name: string
          exercise_order: number
          id: string
          is_skipped: boolean
          notes: string | null
          rep_max: number
          rep_min: number
          replacement_exercise_id: string | null
          rest_seconds: number
          target_rir: number | null
          target_sets: number
          tempo: string | null
          updated_at: string
          workout_session_id: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_name: string
          exercise_order?: number
          id?: string
          is_skipped?: boolean
          notes?: string | null
          rep_max?: number
          rep_min?: number
          replacement_exercise_id?: string | null
          rest_seconds?: number
          target_rir?: number | null
          target_sets?: number
          tempo?: string | null
          updated_at?: string
          workout_session_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_name?: string
          exercise_order?: number
          id?: string
          is_skipped?: boolean
          notes?: string | null
          rep_max?: number
          rep_min?: number
          replacement_exercise_id?: string | null
          rest_seconds?: number
          target_rir?: number | null
          target_sets?: number
          tempo?: string | null
          updated_at?: string
          workout_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_replacement_exercise_id_fkey"
            columns: ["replacement_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_seconds: number
          id: string
          notes: string | null
          session_rpe: number | null
          session_state: string
          started_at: string | null
          total_volume: number
          total_volume_kg: number
          updated_at: string
          user_id: string
          workout_day_id: string | null
          workout_plan_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          notes?: string | null
          session_rpe?: number | null
          session_state?: string
          started_at?: string | null
          total_volume?: number
          total_volume_kg?: number
          updated_at?: string
          user_id: string
          workout_day_id?: string | null
          workout_plan_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          notes?: string | null
          session_rpe?: number | null
          session_state?: string
          started_at?: string | null
          total_volume?: number
          total_volume_kg?: number
          updated_at?: string
          user_id?: string
          workout_day_id?: string | null
          workout_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_workout_day_id_fkey"
            columns: ["workout_day_id"]
            isOneToOne: false
            referencedRelation: "workout_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_workout_plan_id_fkey"
            columns: ["workout_plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          date: string | null
          duration_minutes: number | null
          id: string
          name: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          date?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          date?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_usage_date_for: { Args: { p_user_id: string }; Returns: string }
      can_manage_workout_client: {
        Args: { target_client_id: string }
        Returns: boolean
      }
      can_view_business_profile: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      consume_ai_usage: {
        Args: { p_thread_id?: string }
        Returns: {
          allowed: boolean
          daily_limit: number
          messages_used: number
          plan_code: string
          remaining: number
          usage_date: string
        }[]
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_ai_usage_snapshot: {
        Args: never
        Returns: {
          daily_limit: number
          input_tokens: number
          messages_used: number
          output_tokens: number
          plan_code: string
          remaining: number
          total_tokens: number
          usage_date: string
        }[]
      }
      has_any_role: { Args: { p_roles: string[] }; Returns: boolean }
      has_entitlement: { Args: { p_key: string }; Returns: boolean }
      has_organization_role: {
        Args: { allowed_roles: string[]; target_organization_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_coach: { Args: { p_client_id: string }; Returns: boolean }
      is_business_admin: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      is_business_owner: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      is_business_staff_member: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      record_ai_token_usage: {
        Args: {
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
        }
        Returns: undefined
      }
      refund_ai_usage: { Args: never; Returns: undefined }
      write_audit_log: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "user"
        | "client"
        | "coach"
        | "support"
        | "admin"
        | "super_admin"
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
      app_role: ["user", "client", "coach", "support", "admin", "super_admin"],
    },
  },
} as const
