import BusinessMobileNav from "@/components/business/business-mobile-nav";
import BusinessSidebar from "@/components/business/business-sidebar";

import { requireBusinessAdmin } from "@/lib/business/require-business-admin";

export default async function BusinessPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requireBusinessAdmin();

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="flex min-h-screen">
        <BusinessSidebar
          businessName={admin.businessName}
          role={admin.role}
        />

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      <BusinessMobileNav />
    </div>
  );
}