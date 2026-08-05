/**
 * Supabase Database types for Muscle Fitness.
 * Keep in sync with supabase/migrations/* — regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppPermission =
  | "can_manage_own_profile"
  | "can_manage_clients"
  | "can_manage_workout_client"
  | "can_view_workout_client"
  | "can_manage_exercises"
  | "can_coach";

export type AppRole = "client" | "coach" | "admin";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fitness_profiles: {
        Row: {
          id: string;
          user_id: string;
          goal: string | null;
          experience_level: string | null;
          training_days_per_week: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal?: string | null;
          experience_level?: string | null;
          training_days_per_week?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal?: string | null;
          experience_level?: string | null;
          training_days_per_week?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: AppRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: AppRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: AppRole;
          created_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          unit_system: string | null;
          locale: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          unit_system?: string | null;
          locale?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          unit_system?: string | null;
          locale?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      coach_clients: {
        Row: {
          id: string;
          coach_id: string;
          client_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          client_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          coach_id?: string;
          client_id?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: number;
          role: AppRole;
          permission: AppPermission;
        };
        Insert: {
          id?: number;
          role: AppRole;
          permission: AppPermission;
        };
        Update: {
          id?: number;
          role?: AppRole;
          permission?: AppPermission;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          primary_muscle: string;
          secondary_muscles: string[];
          equipment: string;
          difficulty: string;
          instructions: string[];
          technique_cues: string[];
          media_url: string | null;
          media_type: string | null;
          contraindications: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          primary_muscle: string;
          secondary_muscles?: string[];
          equipment: string;
          difficulty: string;
          instructions?: string[];
          technique_cues?: string[];
          media_url?: string | null;
          media_type?: string | null;
          contraindications?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          primary_muscle?: string;
          secondary_muscles?: string[];
          equipment?: string;
          difficulty?: string;
          instructions?: string[];
          technique_cues?: string[];
          media_url?: string | null;
          media_type?: string | null;
          contraindications?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      workout_plans: {
        Row: {
          id: string;
          user_id: string | null;
          client_id: string | null;
          coach_id: string | null;
          name: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          client_id?: string | null;
          coach_id?: string | null;
          name: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          client_id?: string | null;
          coach_id?: string | null;
          name?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workout_days: {
        Row: {
          id: string;
          workout_plan_id: string;
          name: string;
          day_order: number;
        };
        Insert: {
          id?: string;
          workout_plan_id: string;
          name: string;
          day_order?: number;
        };
        Update: {
          id?: string;
          workout_plan_id?: string;
          name?: string;
          day_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workout_days_workout_plan_id_fkey";
            columns: ["workout_plan_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_exercises: {
        Row: {
          id: string;
          workout_day_id: string;
          exercise_id: string;
          exercise_order: number;
          sets: number;
          rep_min: number;
          rep_max: number;
          target_rir: number | null;
          target_rpe: number | null;
          rest_seconds: number;
          tempo: string | null;
          coach_notes: string | null;
        };
        Insert: {
          id?: string;
          workout_day_id: string;
          exercise_id: string;
          exercise_order?: number;
          sets: number;
          rep_min: number;
          rep_max: number;
          target_rir?: number | null;
          target_rpe?: number | null;
          rest_seconds?: number;
          tempo?: string | null;
          coach_notes?: string | null;
        };
        Update: {
          id?: string;
          workout_day_id?: string;
          exercise_id?: string;
          exercise_order?: number;
          sets?: number;
          rep_min?: number;
          rep_max?: number;
          target_rir?: number | null;
          target_rpe?: number | null;
          rest_seconds?: number;
          tempo?: string | null;
          coach_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercises_workout_day_id_fkey";
            columns: ["workout_day_id"];
            isOneToOne: false;
            referencedRelation: "workout_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string | null;
          workout_plan_id: string | null;
          workout_day_id: string | null;
          name: string;
          status: "in_progress" | "completed" | "abandoned";
          started_at: string;
          completed_at: string | null;
          notes: string | null;
          deload: boolean;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          workout_plan_id?: string | null;
          workout_day_id?: string | null;
          name: string;
          status?: "in_progress" | "completed" | "abandoned";
          started_at?: string;
          completed_at?: string | null;
          notes?: string | null;
          deload?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          workout_plan_id?: string | null;
          workout_day_id?: string | null;
          name?: string;
          status?: "in_progress" | "completed" | "abandoned";
          started_at?: string;
          completed_at?: string | null;
          notes?: string | null;
          deload?: boolean;
        };
        Relationships: [];
      };
      session_exercises: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          exercise_order: number;
          planned_sets: number;
          rep_min: number;
          rep_max: number;
          target_rir: number | null;
          target_rpe: number | null;
          rest_seconds: number;
          tempo: string | null;
          coach_notes: string | null;
          replaced_from_exercise_id: string | null;
          skipped: boolean;
        };
        Insert: {
          id?: string;
          session_id: string;
          exercise_id: string;
          exercise_order?: number;
          planned_sets: number;
          rep_min: number;
          rep_max: number;
          target_rir?: number | null;
          target_rpe?: number | null;
          rest_seconds?: number;
          tempo?: string | null;
          coach_notes?: string | null;
          replaced_from_exercise_id?: string | null;
          skipped?: boolean;
        };
        Update: {
          id?: string;
          session_id?: string;
          exercise_id?: string;
          exercise_order?: number;
          planned_sets?: number;
          rep_min?: number;
          rep_max?: number;
          target_rir?: number | null;
          target_rpe?: number | null;
          rest_seconds?: number;
          tempo?: string | null;
          coach_notes?: string | null;
          replaced_from_exercise_id?: string | null;
          skipped?: boolean;
        };
        Relationships: [];
      };
      logged_sets: {
        Row: {
          id: string;
          session_exercise_id: string;
          set_number: number;
          weight_kg: number;
          reps: number;
          rir: number | null;
          completed: boolean;
          skipped: boolean;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          session_exercise_id: string;
          set_number: number;
          weight_kg?: number;
          reps?: number;
          rir?: number | null;
          completed?: boolean;
          skipped?: boolean;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          session_exercise_id?: string;
          set_number?: number;
          weight_kg?: number;
          reps?: number;
          rir?: number | null;
          completed?: boolean;
          skipped?: boolean;
          completed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      authorize: {
        Args: { requested_permission: AppPermission };
        Returns: boolean;
      };
      has_permission: {
        Args: { requested_permission: AppPermission };
        Returns: boolean;
      };
    };
    Enums: {
      app_permission: AppPermission;
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
