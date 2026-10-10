import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export type BusinessAdminRole = "owner" | "admin";

export type BusinessAdminContext = {
  userId: string;
  businessId: string;
  businessName: string;
  businessSlug: string | null;
  role: BusinessAdminRole;
};

export type ResolveBusinessAdminResult =
  | { ok: true; context: BusinessAdminContext }
  | { ok: false; status: 401 | 403 };

/**
 * Canonical business-admin check: Supabase session, then
 * businesses.owner_id, then business_staff owner/admin.
 * Pages redirect; API routes return 401/403 JSON.
 */
export async function resolveBusinessAdmin(): Promise<ResolveBusinessAdminResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401 };
  }

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
      ok: true,
      context: {
        userId: user.id,
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        role: "owner",
      },
    };
  }

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
    return { ok: false, status: 403 };
  }

  const staff = adminRows[0];

  const {
    data: businesses,
    error: businessError,
  } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("id", staff.business_id)
    .limit(1);

  if (businessError || !businesses?.length) {
    return { ok: false, status: 403 };
  }

  const business = businesses[0];

  return {
    ok: true,
    context: {
      userId: user.id,
      businessId: business.id,
      businessName: business.name,
      businessSlug: business.slug,
      role: staff.role === "owner" ? "owner" : "admin",
    },
  };
}

export async function requireBusinessAdmin(): Promise<BusinessAdminContext> {
  const result = await resolveBusinessAdmin();

  if (!result.ok) {
    redirect(result.status === 401 ? "/admin/login" : "/unauthorized");
  }

  return result.context;
}

export async function requireBusinessAdminApi(): Promise<
  { ok: true; context: BusinessAdminContext } | { ok: false; response: NextResponse }
> {
  const result = await resolveBusinessAdmin();

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: result.status === 401 ? "Unauthorized" : "Forbidden",
        },
        { status: result.status },
      ),
    };
  }

  return { ok: true, context: result.context };
}
