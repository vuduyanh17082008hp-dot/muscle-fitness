import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-mist md:flex-row">
      <DashboardNav />
      <main className="flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
