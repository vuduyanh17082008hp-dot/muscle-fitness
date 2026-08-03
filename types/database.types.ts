/* eslint-disable */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      coach_clients: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          coach_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          coach_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          coach_id?: string
        }
        Relationships: []
      }

      fitness_profiles: {
        Row: {
          activity_level:
            | Database['public']['Enums']['activity_level']
            | null
          calorie_target: number | null
          carb_target_g: number | null
          created_at: string
          current_weight_kg: number | null
          fat_target_g: number | null
          goal:
            | Database['public']['Enums']['fitness_goal']
            | null
          height_cm: number | null
          protein_target_g: number | null
          session_duration_minutes: number | null
          target_weight_kg: number | null
          training_days: number | null
          training_experience:
            | Database['public']['Enums']['training_experience']
            | null
          updated_at: string
          user_id: string
        }

        Insert: {
          activity_level?:
            | Database['public']['Enums']['activity_level']
            | null
          calorie_target?: number | null
          carb_target_g?: number | null
          created_at?: string
          current_weight_kg?: number | null
          fat_target_g?: number | null
          goal?:
            | Database['public']['Enums']['fitness_goal']
            | null
          height_cm?: number | null
          protein_target_g?: number | null
          session_duration_minutes?: number | null
          target_weight_kg?: number | null
          training_days?: number | null
          training_experience?:
            | Database['public']['Enums']['training_experience']
            | null
          updated_at?: string
          user_id: string
        }

        Update: {
          activity_level?:
            | Database['public']['Enums']['activity_level']
            | null
          calorie_target?: number | null
          carb_target_g?: number | null
          created_at?: string
          current_weight_kg?: number | null
          fat_target_g?: number | null
          goal?:
            | Database['public']['Enums']['fitness_goal']
            | null
          height_cm?: number | null
          protein_target_g?: number | null
          session_duration_minutes?: number | null
          target_weight_kg?: number | null
          training_days?: number | null
          training_experience?:
            | Database['public']['Enums']['training_experience']
            | null
          updated_at?: string
          user_id?: string
        }

        Relationships: []
      }

      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender:
            | Database['public']['Enums']['gender_type']
            | null
          onboarding_completed: boolean
          role: Database['public']['Enums']['app_role']
          timezone: string
          updated_at: string
          user_id: string
        }

        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          gender?:
            | Database['public']['Enums']['gender_type']
            | null
          onboarding_completed?: boolean
          role?: Database['public']['Enums']['app_role']
          timezone?: string
          updated_at?: string
          user_id: string
        }

        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          gender?:
            | Database['public']['Enums']['gender_type']
            | null
          onboarding_completed?: boolean
          role?: Database['public']['Enums']['app_role']
          timezone?: string
          updated_at?: string
          user_id?: string
        }

        Relationships: []
      }

      user_preferences: {
        Row: {
          allergies: string[]
          available_equipment: string[]
          created_at: string
          excluded_foods: string[]
          meals_per_day: number
          preferred_foods: string[]
          preferred_training_time:
            Database['public']['Enums']['training_time']
          priority_muscles: string[]
          updated_at: string
          user_id: string
        }

        Insert: {
          allergies?: string[]
          available_equipment?: string[]
          created_at?: string
          excluded_foods?: string[]
          meals_per_day?: number
          preferred_foods?: string[]
          preferred_training_time?:
            Database['public']['Enums']['training_time']
          priority_muscles?: string[]
          updated_at?: string
          user_id: string
        }

        Update: {
          allergies?: string[]
          available_equipment?: string[]
          created_at?: string
          excluded_foods?: string[]
          meals_per_day?: number
          preferred_foods?: string[]
          preferred_training_time?:
            Database['public']['Enums']['training_time']
          priority_muscles?: string[]
          updated_at?: string
          user_id?: string
        }

        Relationships: []
      }

      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database['public']['Enums']['app_role']
          updated_at: string
          user_id: string
        }

        Insert: {
          created_at?: string
          created_by?: string | null
          role?: Database['public']['Enums']['app_role']
          updated_at?: string
          user_id: string
        }

        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database['public']['Enums']['app_role']
          updated_at?: string
          user_id?: string
        }

        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      admin_assign_coach: {
        Args: {
          p_client_id: string
          p_coach_id: string
        }
        Returns: undefined
      }

      admin_set_user_role: {
        Args: {
          p_role: Database['public']['Enums']['app_role']
          p_user_id: string
        }
        Returns: undefined
      }

      admin_unassign_coach: {
        Args: {
          p_client_id: string
        }
        Returns: undefined
      }

      complete_onboarding: {
        Args: {
          p_activity_level:
            Database['public']['Enums']['activity_level']
          p_allergies: string[]
          p_available_equipment: string[]
          p_calorie_target: number
          p_carb_target_g: number
          p_current_weight_kg: number
          p_date_of_birth: string
          p_excluded_foods: string[]
          p_fat_target_g: number
          p_full_name: string
          p_gender:
            Database['public']['Enums']['gender_type']
          p_goal:
            Database['public']['Enums']['fitness_goal']
          p_height_cm: number
          p_meals_per_day: number
          p_preferred_foods: string[]
          p_preferred_training_time:
            Database['public']['Enums']['training_time']
          p_priority_muscles: string[]
          p_protein_target_g: number
          p_session_duration_minutes: number
          p_target_weight_kg: number
          p_timezone: string
          p_training_days: number
          p_training_experience:
            Database['public']['Enums']['training_experience']
        }
        Returns: undefined
      }

      get_user_foundation: {
        Args: {
          p_user_id?: string | null
        }
        Returns: Json
      }

      list_my_assigned_clients: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }

    Enums: {
      activity_level:
        | 'sedentary'
        | 'lightly_active'
        | 'moderately_active'
        | 'very_active'
        | 'athlete'

      app_role:
        | 'user'
        | 'coach'
        | 'admin'

      fitness_goal:
        | 'lose_fat'
        | 'build_muscle'
        | 'recomposition'
        | 'maintain'
        | 'improve_fitness'

      gender_type:
        | 'male'
        | 'female'
        | 'non_binary'
        | 'prefer_not_to_say'

      training_experience:
        | 'beginner'
        | 'intermediate'
        | 'advanced'

      training_time:
        | 'morning'
        | 'afternoon'
        | 'evening'
        | 'flexible'
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  TableName extends keyof Database['public']['Tables'],
> = Database['public']['Tables'][TableName]['Row']

export type TablesInsert<
  TableName extends keyof Database['public']['Tables'],
> = Database['public']['Tables'][TableName]['Insert']

export type TablesUpdate<
  TableName extends keyof Database['public']['Tables'],
> = Database['public']['Tables'][TableName]['Update']

export type Enums<
  EnumName extends keyof Database['public']['Enums'],
> = Database['public']['Enums'][EnumName]

export type Profile = Tables<'profiles'>

export type ProfileInsert =
  TablesInsert<'profiles'>

export type ProfileUpdate =
  TablesUpdate<'profiles'>

export type FitnessProfile =
  Tables<'fitness_profiles'>

export type FitnessProfileInsert =
  TablesInsert<'fitness_profiles'>

export type FitnessProfileUpdate =
  TablesUpdate<'fitness_profiles'>

export type UserPreferences =
  Tables<'user_preferences'>

export type UserPreferencesInsert =
  TablesInsert<'user_preferences'>

export type UserPreferencesUpdate =
  TablesUpdate<'user_preferences'>

export type UserRole =
  Tables<'user_roles'>

export type CoachClient =
  Tables<'coach_clients'>

export type AppRole =
  Enums<'app_role'>

export type GenderType =
  Enums<'gender_type'>

export type FitnessGoal =
  Enums<'fitness_goal'>

export type ActivityLevel =
  Enums<'activity_level'>

export type TrainingExperience =
  Enums<'training_experience'>

export type TrainingTime =
  Enums<'training_time'>