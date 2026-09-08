export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };

  public: {
    Tables: {
      /* ===================================================
         FITNESS PROFILES
      =================================================== */

      fitness_profiles: {
        Row: {
          available_equipment: string[];
          calories_target: number | null;
          carbs_target_g: number | null;
          created_at: string;
          experience: string | null;
          fat_target_g: number | null;
          goal: string | null;
          height_cm: number | null;
          physical_limitations: string | null;
          priority_muscles: string[];
          protein_target_g: number | null;
          session_duration_minutes: number | null;
          training_days: number | null;
          training_location: string | null;
          updated_at: string;
          user_id: string;
          weight_kg: number | null;
        };

        Insert: {
          available_equipment?: string[];
          calories_target?: number | null;
          carbs_target_g?: number | null;
          created_at?: string;
          experience?: string | null;
          fat_target_g?: number | null;
          goal?: string | null;
          height_cm?: number | null;
          physical_limitations?: string | null;
          priority_muscles?: string[];
          protein_target_g?: number | null;
          session_duration_minutes?: number | null;
          training_days?: number | null;
          training_location?: string | null;
          updated_at?: string;
          user_id: string;
          weight_kg?: number | null;
        };

        Update: {
          available_equipment?: string[];
          calories_target?: number | null;
          carbs_target_g?: number | null;
          created_at?: string;
          experience?: string | null;
          fat_target_g?: number | null;
          goal?: string | null;
          height_cm?: number | null;
          physical_limitations?: string | null;
          priority_muscles?: string[];
          protein_target_g?: number | null;
          session_duration_minutes?: number | null;
          training_days?: number | null;
          training_location?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number | null;
        };

        Relationships: [];
      };

      /* ===================================================
         ONBOARDING DRAFTS
      =================================================== */

      onboarding_drafts: {
        Row: {
          created_at: string;
          current_step: number;
          data: Json;
          updated_at: string;
          user_id: string;
        };

        Insert: {
          created_at?: string;
          current_step?: number;
          data?: Json;
          updated_at?: string;
          user_id: string;
        };

        Update: {
          created_at?: string;
          current_step?: number;
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };

        Relationships: [];
      };

      /* ===================================================
         PROFILES
      =================================================== */

      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          date_of_birth: string | null;
          full_name: string | null;
          gender: string | null;
          onboarding_completed: boolean;
          role: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };

        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          full_name?: string | null;
          gender?: string | null;
          onboarding_completed?: boolean;
          role?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };

        Update: {
          avatar_url?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          full_name?: string | null;
          gender?: string | null;
          onboarding_completed?: boolean;
          role?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };

        Relationships: [];
      };

      /* ===================================================
         TRAINING PREFERENCES
      =================================================== */

      training_preferences: {
        Row: {
          user_id: string;

          split_type: string;

          training_days: number;

          custom_split: Json;

          priority_muscles: string[];

          intensity_style: string;

          volume_style: string;

          failure_style: string;

          exercise_style: string;

          excluded_exercises: string[];

          target_session_minutes: number;

          generated_program: Json | null;

          created_at: string;

          updated_at: string;
        };

        Insert: {
          user_id: string;

          split_type?: string;

          training_days?: number;

          custom_split?: Json;

          priority_muscles?: string[];

          intensity_style?: string;

          volume_style?: string;

          failure_style?: string;

          exercise_style?: string;

          excluded_exercises?: string[];

          target_session_minutes?: number;

          generated_program?: Json | null;

          created_at?: string;

          updated_at?: string;
        };

        Update: {
          user_id?: string;

          split_type?: string;

          training_days?: number;

          custom_split?: Json;

          priority_muscles?: string[];

          intensity_style?: string;

          volume_style?: string;

          failure_style?: string;

          exercise_style?: string;

          excluded_exercises?: string[];

          target_session_minutes?: number;

          generated_program?: Json | null;

          created_at?: string;

          updated_at?: string;
        };

        Relationships: [];
      };

      /* ===================================================
         USER PREFERENCES
      =================================================== */

      user_preferences: {
        Row: {
          allergies: string[];
          cooking_ability: string | null;
          created_at: string;
          daily_steps: number | null;
          excluded_foods: string[];
          food_preferences: string[];
          meal_prep_frequency: string | null;
          meals_per_day: number | null;
          preferred_training_time: string | null;
          sleep_hours: number | null;
          stress_level: string | null;
          updated_at: string;
          user_id: string;
          weekly_food_budget: number | null;
          work_schedule: string | null;
        };

        Insert: {
          allergies?: string[];
          cooking_ability?: string | null;
          created_at?: string;
          daily_steps?: number | null;
          excluded_foods?: string[];
          food_preferences?: string[];
          meal_prep_frequency?: string | null;
          meals_per_day?: number | null;
          preferred_training_time?: string | null;
          sleep_hours?: number | null;
          stress_level?: string | null;
          updated_at?: string;
          user_id: string;
          weekly_food_budget?: number | null;
          work_schedule?: string | null;
        };

        Update: {
          allergies?: string[];
          cooking_ability?: string | null;
          created_at?: string;
          daily_steps?: number | null;
          excluded_foods?: string[];
          food_preferences?: string[];
          meal_prep_frequency?: string | null;
          meals_per_day?: number | null;
          preferred_training_time?: string | null;
          sleep_hours?: number | null;
          stress_level?: string | null;
          updated_at?: string;
          user_id?: string;
          weekly_food_budget?: number | null;
          work_schedule?: string | null;
        };

        Relationships: [];
      };

      /* ===================================================
         LEGACY USER PROFILES
      =================================================== */

      user_profiles: {
        Row: {
          created_at: string | null;
          full_name: string | null;
          id: string;
          primary_goal: string | null;
          updated_at: string | null;
        };

        Insert: {
          created_at?: string | null;
          full_name?: string | null;
          id: string;
          primary_goal?: string | null;
          updated_at?: string | null;
        };

        Update: {
          created_at?: string | null;
          full_name?: string | null;
          id?: string;
          primary_goal?: string | null;
          updated_at?: string | null;
        };

        Relationships: [];
      };

      /* ===================================================
         WORKOUTS
      =================================================== */

      workouts: {
        Row: {
          date: string | null;
          duration_minutes: number | null;
          id: string;
          name: string | null;
          notes: string | null;
          user_id: string | null;
        };

        Insert: {
          date?: string | null;
          duration_minutes?: number | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          user_id?: string | null;
        };

        Update: {
          date?: string | null;
          duration_minutes?: number | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          user_id?: string | null;
        };

        Relationships: [];
      };
    };

    /* =====================================================
       VIEWS
    ===================================================== */

    Views: {
      [_ in never]: never;
    };

    /* =====================================================
       FUNCTIONS
    ===================================================== */

    Functions: {
      [_ in never]: never;
    };

    /* =====================================================
       ENUMS
    ===================================================== */

    Enums: {
      [_ in never]: never;
    };

    /* =====================================================
       COMPOSITE TYPES
    ===================================================== */

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/* =========================================================
   DATABASE HELPERS
========================================================= */

type DatabaseWithoutInternals =
  Omit<
    Database,
    "__InternalSupabase"
  >;

type DefaultSchema =
  DatabaseWithoutInternals[
    Extract<
      keyof Database,
      "public"
    >
  ];

/* =========================================================
   TABLE ROW TYPE
========================================================= */

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (
        DefaultSchema["Tables"] &
        DefaultSchema["Views"]
      )
    | {
        schema:
          keyof DatabaseWithoutInternals;
      },

  TableName extends
    DefaultSchemaTableNameOrOptions extends {
      schema:
        keyof DatabaseWithoutInternals;
    }
      ? keyof (
          DatabaseWithoutInternals[
            DefaultSchemaTableNameOrOptions["schema"]
          ]["Tables"] &
          DatabaseWithoutInternals[
            DefaultSchemaTableNameOrOptions["schema"]
          ]["Views"]
        )
      : never = never,
> =
  DefaultSchemaTableNameOrOptions extends {
    schema:
      keyof DatabaseWithoutInternals;
  }
    ? (
        DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Tables"] &
        DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Views"]
      )[TableName] extends {
        Row: infer R;
      }
      ? R
      : never
    : DefaultSchemaTableNameOrOptions extends keyof (
          DefaultSchema["Tables"] &
          DefaultSchema["Views"]
        )
      ? (
          DefaultSchema["Tables"] &
          DefaultSchema["Views"]
        )[DefaultSchemaTableNameOrOptions] extends {
          Row: infer R;
        }
        ? R
        : never
      : never;

/* =========================================================
   INSERT TYPE
========================================================= */

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema:
          keyof DatabaseWithoutInternals;
      },

  TableName extends
    DefaultSchemaTableNameOrOptions extends {
      schema:
        keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Tables"]
      : never = never,
> =
  DefaultSchemaTableNameOrOptions extends {
    schema:
      keyof DatabaseWithoutInternals;
  }
    ? DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions["schema"]
      ]["Tables"][TableName] extends {
        Insert: infer I;
      }
      ? I
      : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][
          DefaultSchemaTableNameOrOptions
        ] extends {
          Insert: infer I;
        }
        ? I
        : never
      : never;

/* =========================================================
   UPDATE TYPE
========================================================= */

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema:
          keyof DatabaseWithoutInternals;
      },

  TableName extends
    DefaultSchemaTableNameOrOptions extends {
      schema:
        keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Tables"]
      : never = never,
> =
  DefaultSchemaTableNameOrOptions extends {
    schema:
      keyof DatabaseWithoutInternals;
  }
    ? DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions["schema"]
      ]["Tables"][TableName] extends {
        Update: infer U;
      }
      ? U
      : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][
          DefaultSchemaTableNameOrOptions
        ] extends {
          Update: infer U;
        }
        ? U
        : never
      : never;

/* =========================================================
   ENUM TYPE
========================================================= */

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | {
        schema:
          keyof DatabaseWithoutInternals;
      },

  EnumName extends
    DefaultSchemaEnumNameOrOptions extends {
      schema:
        keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaEnumNameOrOptions["schema"]
        ]["Enums"]
      : never = never,
> =
  DefaultSchemaEnumNameOrOptions extends {
    schema:
      keyof DatabaseWithoutInternals;
  }
    ? DatabaseWithoutInternals[
        DefaultSchemaEnumNameOrOptions["schema"]
      ]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
      ? DefaultSchema["Enums"][
          DefaultSchemaEnumNameOrOptions
        ]
      : never;

/* =========================================================
   COMPOSITE TYPE
========================================================= */

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | {
        schema:
          keyof DatabaseWithoutInternals;
      },

  CompositeTypeName extends
    PublicCompositeTypeNameOrOptions extends {
      schema:
        keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          PublicCompositeTypeNameOrOptions["schema"]
        ]["CompositeTypes"]
      : never = never,
> =
  PublicCompositeTypeNameOrOptions extends {
    schema:
      keyof DatabaseWithoutInternals;
  }
    ? DatabaseWithoutInternals[
        PublicCompositeTypeNameOrOptions["schema"]
      ]["CompositeTypes"][
        CompositeTypeName
      ]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
      ? DefaultSchema["CompositeTypes"][
          PublicCompositeTypeNameOrOptions
        ]
      : never;

/* =========================================================
   CONSTANTS
========================================================= */

export const Constants = {
  public: {
    Enums: {},
  },
} as const;