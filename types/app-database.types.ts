import type {
  Database as GeneratedDatabase,
} from "@/database.types";

type WorkoutPlanStatus =
  | "draft"
  | "active"
  | "archived";

type WorkoutTables = {
  workout_plans: {
    Row: {
      id: string;
      client_id: string;
      created_by: string;
      name: string;
      description: string | null;
      goal: string | null;
      status: WorkoutPlanStatus;
      weeks: number;
      days_per_week: number;
      session_duration_minutes: number;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      client_id: string;
      created_by: string;
      name: string;
      description?: string | null;
      goal?: string | null;
      status?: WorkoutPlanStatus;
      weeks?: number;
      days_per_week?: number;
      session_duration_minutes?: number;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      client_id?: string;
      created_by?: string;
      name?: string;
      description?: string | null;
      goal?: string | null;
      status?: WorkoutPlanStatus;
      weeks?: number;
      days_per_week?: number;
      session_duration_minutes?: number;
      created_at?: string;
      updated_at?: string;
    };

    Relationships: [];
  };

  workout_days: {
    Row: {
      id: string;
      workout_plan_id: string;
      day_number: number;
      name: string;
      focus: string | null;
      notes: string | null;
      rest_day: boolean;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      workout_plan_id: string;
      day_number: number;
      name: string;
      focus?: string | null;
      notes?: string | null;
      rest_day?: boolean;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      workout_plan_id?: string;
      day_number?: number;
      name?: string;
      focus?: string | null;
      notes?: string | null;
      rest_day?: boolean;
      created_at?: string;
      updated_at?: string;
    };

    Relationships: [];
  };

  workout_exercises: {
    Row: {
      id: string;
      workout_day_id: string;
      exercise_id: string | null;
      exercise_name: string;
      exercise_order: number;
      target_sets: number;
      rep_min: number;
      rep_max: number;
      rest_seconds: number;
      tempo: string | null;
      rir: number | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      workout_day_id: string;
      exercise_id?: string | null;
      exercise_name: string;
      exercise_order?: number;
      target_sets?: number;
      rep_min?: number;
      rep_max?: number;
      rest_seconds?: number;
      tempo?: string | null;
      rir?: number | null;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      workout_day_id?: string;
      exercise_id?: string | null;
      exercise_name?: string;
      exercise_order?: number;
      target_sets?: number;
      rep_min?: number;
      rep_max?: number;
      rest_seconds?: number;
      tempo?: string | null;
      rir?: number | null;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Relationships: [];
  };
};

type WorkoutFunctions = {
  can_manage_workout_client: {
    Args: {
      target_client_id: string;
    };

    Returns: boolean;
  };
};

type ExistingPublic =
  GeneratedDatabase["public"];

export type Database =
  Omit<GeneratedDatabase, "public"> & {
    public: Omit<
      ExistingPublic,
      "Tables" | "Functions"
    > & {
      Tables: Omit<
        ExistingPublic["Tables"],
        keyof WorkoutTables
      > &
        WorkoutTables;

      Functions: Omit<
        ExistingPublic["Functions"],
        keyof WorkoutFunctions
      > &
        WorkoutFunctions;
    };
  };