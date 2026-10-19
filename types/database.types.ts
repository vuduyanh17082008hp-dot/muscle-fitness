// DEPRECATED shim: the schema now lives in ../database.types.generated.ts (see docs/database-types.md).
// Only the app-level aliases below are maintained here.
import type { Tables, TablesInsert, TablesUpdate, Enums } from "../database.types.generated"

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "../database.types.generated"

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