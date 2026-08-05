import type {
  Database as GeneratedDatabase,
} from "@/database.types";

type WorkoutPlanStatus =
  | "draft"
  | "active"
  | "archived";

type WorkoutSessionState =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

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

  workout_sessions: {
    Row: {
      id: string;
      user_id: string;
      workout_plan_id: string | null;
      workout_day_id: string | null;
      session_state: WorkoutSessionState;
      started_at: string | null;
      completed_at: string | null;
      duration_seconds: number;
      total_volume: number;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      user_id: string;
      workout_plan_id?: string | null;
      workout_day_id?: string | null;
      session_state?: WorkoutSessionState;
      started_at?: string | null;
      completed_at?: string | null;
      duration_seconds?: number;
      total_volume?: number;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      user_id?: string;
      workout_plan_id?: string | null;
      workout_day_id?: string | null;
      session_state?: WorkoutSessionState;
      started_at?: string | null;
      completed_at?: string | null;
      duration_seconds?: number;
      total_volume?: number;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Relationships: [];
  };

  workout_session_exercises: {
    Row: {
      id: string;
      workout_session_id: string;
      exercise_id: string | null;
      replacement_exercise_id: string | null;
      exercise_name: string;
      exercise_order: number;
      target_sets: number;
      rep_min: number;
      rep_max: number;
      rest_seconds: number;
      target_rir: number | null;
      tempo: string | null;
      is_skipped: boolean;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      workout_session_id: string;
      exercise_id?: string | null;
      replacement_exercise_id?: string | null;
      exercise_name: string;
      exercise_order?: number;
      target_sets?: number;
      rep_min?: number;
      rep_max?: number;
      rest_seconds?: number;
      target_rir?: number | null;
      tempo?: string | null;
      is_skipped?: boolean;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      workout_session_id?: string;
      exercise_id?: string | null;
      replacement_exercise_id?: string | null;
      exercise_name?: string;
      exercise_order?: number;
      target_sets?: number;
      rep_min?: number;
      rep_max?: number;
      rest_seconds?: number;
      target_rir?: number | null;
      tempo?: string | null;
      is_skipped?: boolean;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Relationships: [];
  };

  exercise_sets: {
    Row: {
      id: string;
      workout_session_id: string;
      workout_session_exercise_id: string;
      set_number: number;
      weight_kg: number | null;
      reps: number | null;
      rir: number | null;
      completed: boolean;
      completed_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    Insert: {
      id?: string;
      workout_session_id: string;
      workout_session_exercise_id: string;
      set_number: number;
      weight_kg?: number | null;
      reps?: number | null;
      rir?: number | null;
      completed?: boolean;
      completed_at?: string | null;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };

    Update: {
      id?: string;
      workout_session_id?: string;
      workout_session_exercise_id?: string;
      set_number?: number;
      weight_kg?: number | null;
      reps?: number | null;
      rir?: number | null;
      completed?: boolean;
      completed_at?: string | null;
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
  start_workout: {
    Args: {
      p_workout_day_id: string;
    };
    Returns: string;
  };
  finish_workout: {
    Args: {
      p_session_id: string;
      p_notes?: string | null;
      p_session_rpe?: number | null;
    };
    Returns: unknown;
  };
  activate_workout_plan: {
    Args: {
      p_plan_id: string;
    };
    Returns: unknown;
  };
  get_client_dashboard: {
    Args: Record<string, never>;
    Returns: unknown;
  };
  get_user_foundation: {
    Args: {
      p_user_id?: string;
    };
    Returns: unknown;
  };
  get_previous_workout_performance: {
    Args: Record<string, unknown>;
    Returns: unknown;
  };
  get_workout_recommendations: {
    Args: Record<string, unknown>;
    Returns: unknown;
  };
  admin_set_user_role: {
    Args: {
      p_user_id: string;
      p_role: string;
    };
    Returns: unknown;
  };
  admin_assign_coach: {
    Args: Record<string, unknown>;
    Returns: unknown;
  };
  admin_unassign_coach: {
    Args: Record<string, unknown>;
    Returns: unknown;
  };
  list_my_assigned_clients: {
    Args: Record<string, never>;
    Returns: unknown;
  };
  [functionName: string]: {
    Args: Record<string, unknown>;
    Returns: unknown;
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

      Functions: WorkoutFunctions;
    };
  };