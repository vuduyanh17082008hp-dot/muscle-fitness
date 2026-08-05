export type ExerciseLibraryItem = {
  id: string
  name: string
  slug: string
  description: string | null
  primary_muscle: string
  secondary_muscles: string[]
  equipment: string
  movement_pattern: string | null
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  instructions: string[]
  cues: string[]
  limitations: string[]
  media_url: string | null
  is_verified: boolean
}

export type WorkoutPlanSummary = {
  id: string
  name: string
  description: string | null
  goal: string | null
  status: 'draft' | 'active' | 'paused' | 'archived'
  allow_client_substitution: boolean
  created_at: string
}

export type WorkoutDay = {
  id: string
  workout_plan_id: string
  name: string
  day_order: number
  scheduled_weekday: number | null
  notes: string | null
}

export type WorkoutPlanExercise = {
  id: string
  workout_day_id: string
  exercise_id: string
  exercise_order: number
  target_sets: number
  rep_min: number
  rep_max: number
  target_rir: number
  target_rpe: number | null
  rest_seconds: number
  tempo: string | null
  notes: string | null
}

export type PreviousSet = {
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  rpe: number | null
}

export type PreviousPerformance = {
  exercise_id: string
  performed_at: string
  sets: PreviousSet[]
}

export type WorkoutPlayerSet = {
  id: string
  setNumber: number
  setType: string
  targetReps: number | null
  weightKg: number | null
  reps: number | null
  rir: number | null
  rpe: number | null
  completed: boolean
}

export type WorkoutPlayerExercise = {
  id: string
  exerciseId: string
  name: string
  primaryMuscle: string
  equipment: string
  exerciseOrder: number
  targetSets: number
  repMin: number
  repMax: number
  targetRir: number | null
  targetRpe: number | null
  restSeconds: number
  notes: string | null
  isSkipped: boolean
  sets: WorkoutPlayerSet[]
  previous: PreviousPerformance | null
}

export type WorkoutReplacementOption = {
  id: string
  name: string
  primaryMuscle: string
  equipment: string
}

export type WorkoutRecommendation = {
  exercise_id: string
  exercise_name: string
  last_weight_kg: number | null
  suggested_weight_kg: number | null
  recommendation_action: 'increase' | 'hold' | 'reduce' | 'repeat'
  reason: string
  last_performed_at: string
}