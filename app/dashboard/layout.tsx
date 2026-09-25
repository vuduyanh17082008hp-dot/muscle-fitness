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
  await requireCompletedOnboarding()

  return (
    <DashboardShell>
      {children}
    </DashboardShell>
  )
}
