import type { ReactNode } from "react"

import SiteHeader from "@/components/layout/site-header"

type MarketingLayoutProps = {
  children: ReactNode
}

export default function MarketingLayout({
  children,
}: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <SiteHeader />

      <main>{children}</main>
    </div>
  )
}