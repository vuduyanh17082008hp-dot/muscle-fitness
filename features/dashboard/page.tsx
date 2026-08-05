import { redirect } from 'next/navigation'

import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { getDashboardData } from '@/features/dashboard/queries'

export const dynamic =
  'force-dynamic'

export default async function DashboardPage() {
  const data =
    await getDashboardData()

  if (
    !data.profile
      .onboardingCompleted
  ) {
    redirect('/onboarding')
  }

  return (
    <DashboardOverview
      data={data}
    />
  )
}