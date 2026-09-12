import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type BusinessAdminRole = "owner" | "admin";

export type BusinessAdminContext = {
  userId: string;
  businessId: string;
  businessName: string;
  businessSlug: string | null;
  role: BusinessAdminRole;
};

export async function requireBusinessAdmin(): Promise<BusinessAdminContext> {
  const supabase = await createClient();

  // ============================================================
  // 1. AUTH USER
  // ============================================================

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/admin/login");
  }

  // ============================================================
  // 2. CHECK BUSINESS OWNER
  // ============================================================

  const {
    data: ownedBusinesses,
    error: ownerError,
  } = await supabase
    .from("businesses")
    .select("id, name, slug, owner_id")
    .eq("owner_id", user.id)
    .order("created_at", {
      ascending: true,
    })
    .limit(1);

  if (!ownerError && ownedBusinesses?.length) {
    const business = ownedBusinesses[0];

    return {
      userId: user.id,
      businessId: business.id,
      businessName: business.name,
      businessSlug: business.slug,
      role: "owner",
    };
  }

  // ============================================================
  // 3. CHECK BUSINESS_STAFF ADMIN
  // ============================================================

  const {
    data: adminRows,
    error: staffError,
  } = await supabase
    .from("business_staff")
    .select("business_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (staffError || !adminRows?.length) {
    redirect("/unauthorized");
  }

  const staff = adminRows[0];

  // ============================================================
  // 4. LOAD BUSINESS
  // ============================================================

  const {
    data: businesses,
    error: businessError,
  } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("id", staff.business_id)
    .limit(1);

  if (businessError || !businesses?.length) {
    redirect("/unauthorized");
  }

  const business = businesses[0];

  return {
    userId: user.id,
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    role: staff.role === "owner" ? "owner" : "admin",
  };
}