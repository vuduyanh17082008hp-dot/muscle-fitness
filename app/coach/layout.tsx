import type { ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";

type CoachLayoutProps = {
  children: ReactNode;
};

export default function CoachLayout({
  children,
}: CoachLayoutProps) {
  return <DashboardShell>{children}</DashboardShell>;
}