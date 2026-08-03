export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]:
        | Json
        | undefined
    }
  | Json[]

export type AppRole =
  | "user"
  | "client"
  | "coach"
  | "admin"

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          full_name: string | null
          avatar_url: string | null
          date_of_birth: string | null
          gender: string | null
          timezone: string
          role: string
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }

        Insert: {
          user_id: string
          full_name?: string | null
          avatar_url?: string | null
          date_of_birth?: string | null
          gender?: string | null
          timezone?: string
          role?: string
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }

        Update: {
          user_id?: string
          full_name?: string | null
          avatar_url?: string | null
          date_of_birth?: string | null
          gender?: string | null
          timezone?: string
          role?: string
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }

      fitness_profiles: {
        Row: {
          user_id: string
          height_cm: number | null
          weight_kg: number | null
          goal: string | null
          experience: string | null
          training_days: number | null
          session_duration_minutes:
            | number
            | null
          training_location:
            | string
            | null
          available_equipment: string[]
          priority_muscles: string[]
          physical_limitations:
            | string
            | null
          calories_target: number | null
          protein_target_g: number | null
          carbs_target_g: number | null
          fat_target_g: number | null
          created_at: string
          updated_at: string
        }

        Insert: {
          user_id: string
          height_cm?: number | null
          weight_kg?: number | null
          goal?: string | null
          experience?: string | null
          training_days?: number | null
          session_duration_minutes?:
            | number
            | null
          training_location?:
            | string
            | null
          available_equipment?: string[]
          priority_muscles?: string[]
          physical_limitations?:
            | string
            | null
          calories_target?:
            | number
            | null
          protein_target_g?:
            | number
            | null
          carbs_target_g?:
            | number
            | null
          fat_target_g?:
            | number
            | null
          created_at?: string
          updated_at?: string
        }

        Update: {
          user_id?: string
          height_cm?: number | null
          weight_kg?: number | null
          goal?: string | null
          experience?: string | null
          training_days?: number | null
          session_duration_minutes?:
            | number
            | null
          training_location?:
            | string
            | null
          available_equipment?: string[]
          priority_muscles?: string[]
          physical_limitations?:
            | string
            | null
          calories_target?:
            | number
            | null
          protein_target_g?:
            | number
            | null
          carbs_target_g?:
            | number
            | null
          fat_target_g?:
            | number
            | null
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }

      user_preferences: {
        Row: {
          user_id: string
          meals_per_day: number | null
          food_preferences: string[]
          excluded_foods: string[]
          allergies: string[]
          weekly_food_budget:
            | number
            | null
          cooking_ability:
            | string
            | null
          meal_prep_frequency:
            | string
            | null
          sleep_hours: number | null
          daily_steps: number | null
          work_schedule: string | null
          stress_level: string | null
          preferred_training_time:
            | string
            | null
          created_at: string
          updated_at: string
        }

        Insert: {
          user_id: string
          meals_per_day?:
            | number
            | null
          food_preferences?: string[]
          excluded_foods?: string[]
          allergies?: string[]
          weekly_food_budget?:
            | number
            | null
          cooking_ability?:
            | string
            | null
          meal_prep_frequency?:
            | string
            | null
          sleep_hours?: number | null
          daily_steps?: number | null
          work_schedule?: string | null
          stress_level?: string | null
          preferred_training_time?:
            | string
            | null
          created_at?: string
          updated_at?: string
        }

        Update: {
          user_id?: string
          meals_per_day?:
            | number
            | null
          food_preferences?: string[]
          excluded_foods?: string[]
          allergies?: string[]
          weekly_food_budget?:
            | number
            | null
          cooking_ability?:
            | string
            | null
          meal_prep_frequency?:
            | string
            | null
          sleep_hours?: number | null
          daily_steps?: number | null
          work_schedule?: string | null
          stress_level?: string | null
          preferred_training_time?:
            | string
            | null
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }

      onboarding_drafts: {
        Row: {
          user_id: string
          current_step: number
          data: Json
          created_at: string
          updated_at: string
        }

        Insert: {
          user_id: string
          current_step?: number
          data?: Json
          created_at?: string
          updated_at?: string
        }

        Update: {
          user_id?: string
          current_step?: number
          data?: Json
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }

      user_roles: {
        Row: {
          user_id: string
          role: string
          created_at: string
          updated_at: string
        }

        Insert: {
          user_id: string
          role?: string
          created_at?: string
          updated_at?: string
        }

        Update: {
          user_id?: string
          role?: string
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }

      coach_clients: {
        Row: {
          coach_id: string
          client_id: string
          status: string
          assigned_at: string
          created_at: string
          updated_at: string
        }

        Insert: {
          coach_id: string
          client_id: string
          status?: string
          assigned_at?: string
          created_at?: string
          updated_at?: string
        }

        Update: {
          coach_id?: string
          client_id?: string
          status?: string
          assigned_at?: string
          created_at?: string
          updated_at?: string
        }

        Relationships: []
      }
    }

    Views: {
      [_viewName: string]: {
        Row: Record<string, unknown>
        Relationships: []
      }
    }

    /**
     * Cho phép các RPC hiện có nhận object
     * như:
     *
     * { p_user_id: string }
     * { p_user_id: string, p_role: string }
     *
     * Thay vì bị suy luận thành undefined.
     */
    Functions: {
      [_functionName: string]: {
        Args: Record<string, unknown>
        Returns: Json
      }
    }

    Enums: {
      app_role:
        | "user"
        | "coach"
        | "admin"
    }

    CompositeTypes: {
      [_compositeName: string]: {
        [key: string]: unknown
      }
    }
  }
}

export type PublicSchema =
  Database["public"]

export type PublicTables =
  PublicSchema["Tables"]

export type Tables<
  TableName extends keyof PublicTables,
> = PublicTables[TableName]["Row"]

export type TablesInsert<
  TableName extends keyof PublicTables,
> = PublicTables[TableName]["Insert"]

export type TablesUpdate<
  TableName extends keyof PublicTables,
> = PublicTables[TableName]["Update"]