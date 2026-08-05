import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { requireUser } from '@/lib/auth/guard'

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
   * Layout chỉ kiểm tra authentication.
   *
   * Onboarding status và profile sẽ được dashboard page
   * lấy từ RPC get_client_dashboard().
   */
  await requireUser()

  return (
    <DashboardShell>
      {children}
    </DashboardShell>
  )
}