/**
 * Structured event model (spec Part B §14).
 *
 * A deliberately small, closed set of events — exactly the ones named
 * in the spec, matching the `app_events_type_check` DB constraint.
 * Adding a new event type means updating both this union AND that
 * constraint together; they must never drift apart.
 */

export type AppEventType =
  | "WORKOUT_COMPLETED"
  | "SET_ANALYZED"
  | "FOOD_LOGGED"
  | "RECOVERY_UPDATED"
  | "BODYWEIGHT_UPDATED"
  | "CHECKIN_COMPLETED";

export type WorkoutCompletedPayload = {
  workoutSessionId: string;
  totalVolumeKg: number | null;
  totalSets: number | null;
  sessionRpe: number | null;
};

export type SetAnalyzedPayload = {
  exercise: string;
  reps: number;
  velocityLoss: number | null;
  confidence: number;
};

export type FoodLoggedPayload = {
  foodLogId: string;
  mealType: string;
  calories: number;
  source: string;
};

export type RecoveryUpdatedPayload = {
  recoveryScore: number | null;
  status: string | null;
};

export type BodyweightUpdatedPayload = {
  weightKg: number;
};

export type CheckinCompletedPayload = {
  checkinDate: string;
};

export type AppEventPayloadMap = {
  WORKOUT_COMPLETED: WorkoutCompletedPayload;
  SET_ANALYZED: SetAnalyzedPayload;
  FOOD_LOGGED: FoodLoggedPayload;
  RECOVERY_UPDATED: RecoveryUpdatedPayload;
  BODYWEIGHT_UPDATED: BodyweightUpdatedPayload;
  CHECKIN_COMPLETED: CheckinCompletedPayload;
};

export type AppEvent<T extends AppEventType = AppEventType> = {
  type: T;
  userId: string;
  payload: AppEventPayloadMap[T];
};
