import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { requireCompletedOnboarding } from '@/lib/auth/guard'

export const metadata: Metadata = {
  title: 'Client Dashboard | Muscle Fitness',

  description:
    'Your private Muscle Fitness client dashboard.',
}

type DashboardLayoutProps = Readonly<{
  children: ReactNode
}>

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  /*
   * Shared product boundary: authenticated + onboarding complete.
   * Incomplete profiles never reach /dashboard/* pages.
   * Unauthenticated users are redirected to login by requireUser
   * (and by the session proxy before this layout runs).
   */
  const { supabase, userId } = await requireCompletedOnboarding()

  // The Train tab reads "Active" only for a session the athlete really has open.
  // A failed read just leaves it as "Train" — navigation, never a training go-ahead.
  const { data: activeSession } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .in('session_state', ['in_progress', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <DashboardShell activeSessionId={(activeSession as { id: string } | null)?.id ?? null}>
      {children}
    </DashboardShell>
  )
}
