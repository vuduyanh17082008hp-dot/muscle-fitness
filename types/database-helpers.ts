import type {
  Database,
  Json,
} from '@/types/database.types'

export type Profile =
  Database['public']['Tables']['profiles']['Row']

export type FitnessProfile =
  Database['public']['Tables']['fitness_profiles']['Row']

export type UserPreferences =
  Database['public']['Tables']['user_preferences']['Row']

export type UserRoleRow =
  Database['public']['Tables']['user_roles']['Row']

export type CoachClient =
  Database['public']['Tables']['coach_clients']['Row']

export type AppRole =
  Database['public']['Enums']['app_role']

export type Gender =
  Database['public']['Enums']['gender_type']

export type FitnessGoal =
  Database['public']['Enums']['fitness_goal']

export type ActivityLevel =
  Database['public']['Enums']['activity_level']

export type TrainingExperience =
  Database['public']['Enums']['training_experience']

export type TrainingTime =
  Database['public']['Enums']['training_time']

export type FoundationData = {
  profile: Profile
  fitnessProfile: FitnessProfile | null
  preferences: UserPreferences | null
  role: AppRole
}

export type AssignedClientData = {
  assignment: CoachClient
  profile: Profile
  fitnessProfile: FitnessProfile | null
  preferences: UserPreferences | null
}

export function asFoundationData(
  value: Json,
): FoundationData {
  return value as unknown as FoundationData
}

export function asAssignedClients(
  value: Json,
): AssignedClientData[] {
  return value as unknown as AssignedClientData[]
}