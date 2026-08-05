import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { requireUser } from '@/lib/auth/guard'

export const metadata: Metadata = {
  title:
    'Client Dashboard | Muscle Fitness',

  description:
    'Your private Muscle Fitness client dashboard.',
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  await requireUser()

  return (
    <DashboardShell>
      {children}
    </DashboardShell>
  )
}