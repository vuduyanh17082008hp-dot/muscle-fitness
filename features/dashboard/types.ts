import { z } from 'zod'

const numberValue = z
  .union([
    z.number(),
    z.string(),
  ])
  .transform(
    (value, context) => {
      const parsed = Number(value)

      if (!Number.isFinite(parsed)) {
        context.addIssue({
          code: 'custom',
          message:
            'Expected a finite number.',
        })

        return z.NEVER
      }

      return parsed
    },
  )

const nullableNumber = z
  .null()
  .or(numberValue)

export const dashboardDataSchema =
  z.object({
    dashboardDate: z.string(),

    profile: z.object({
      fullName: z.string().nullable(),
      timezone: z.string().min(1),
      onboardingCompleted: z.boolean(),
    }),

    fitness: z.object({
      goal: z.string().nullable(),

      currentWeightKg:
        nullableNumber,

      targetWeightKg:
        nullableNumber,

      calorieTarget:
        nullableNumber,

      proteinTargetG:
        nullableNumber,

      carbTargetG:
        nullableNumber,

      fatTargetG:
        nullableNumber,

      waterTargetMl:
        nullableNumber,

      stepTarget:
        nullableNumber,
    }),

    todayMetrics: z
      .object({
        caloriesConsumed:
          numberValue,

        proteinConsumedG:
          numberValue,

        waterMl:
          numberValue,

        steps:
          numberValue,

        sleepHours:
          nullableNumber,

        energyLevel:
          nullableNumber,

        sorenessLevel:
          nullableNumber,

        stressLevel:
          nullableNumber,

        workoutCompleted:
          z.boolean(),

        recoveryScore:
          nullableNumber,

        adherenceScore:
          nullableNumber,
      })
      .nullable(),

    todayWorkouts: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        focus: z.string().nullable(),

        startTime:
          z.string().nullable(),

        durationMinutes:
          nullableNumber,

        status: z.string(),
      }),
    ),

    weightTrend: z.array(
      z.object({
        date: z.string(),

        weightKg:
          numberValue,
      }),
    ),

    weeklyAdherence:
      nullableNumber,

    coachMessage: z
      .object({
        id: z.string().uuid(),

        senderName:
          z.string().nullable(),

        senderRole:
          z.string(),

        body:
          z.string(),

        createdAt:
          z.string(),

        isRead:
          z.boolean(),
      })
      .nullable(),
  })

export type DashboardData =
  z.infer<
    typeof dashboardDataSchema
  > & {
    userEmail: string | null
  }

export type TodayMetrics =
  NonNullable<
    DashboardData['todayMetrics']
  >