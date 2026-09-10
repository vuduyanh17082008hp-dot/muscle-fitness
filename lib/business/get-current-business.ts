import { createClient } from "@/lib/supabase/server";

export type BusinessRole =
  | "owner"
  | "admin"
  | "trainer"
  | "staff";

export type CurrentBusiness = {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  currentUserRole: BusinessRole;
};

function logSupabaseError(
  label: string,
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null
) {
  if (!error) {
    return;
  }

  console.error(label, {
    message: error.message ?? "Unknown Supabase error",
    code: error.code ?? "NO_CODE",
    details: error.details ?? "No details",
    hint: error.hint ?? "No hint",
  });
}

export async function getCurrentBusiness(): Promise<CurrentBusiness | null> {
  const supabase = await createClient();

  // =========================================================
  // 1. AUTHENTICATED USER
  // =========================================================

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    logSupabaseError("AUTH ERROR:", authError);
    return null;
  }

  if (!user) {
    return null;
  }

  // =========================================================
  // 2. CHECK BUSINESS OWNERSHIP
  // =========================================================

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

  if (ownerError) {
    logSupabaseError(
      "GET OWNED BUSINESS ERROR:",
      ownerError
    );
  } else {
    const ownedBusiness = ownedBusinesses?.[0];

    if (ownedBusiness) {
      return {
        id: ownedBusiness.id,
        name: ownedBusiness.name,
        slug: ownedBusiness.slug,
        owner_id: ownedBusiness.owner_id,
        currentUserRole: "owner",
      };
    }
  }

  // =========================================================
  // 3. CHECK STAFF MEMBERSHIP
  // =========================================================

  const {
    data: staffMemberships,
    error: staffError,
  } = await supabase
    .from("business_staff")
    .select("business_id, role")
    .eq("user_id", user.id)
    .limit(1);

  if (staffError) {
    logSupabaseError(
      "GET BUSINESS STAFF ERROR:",
      staffError
    );

    return null;
  }

  const staffMembership = staffMemberships?.[0];

  if (!staffMembership) {
    return null;
  }

  // =========================================================
  // 4. LOAD STAFF BUSINESS
  // =========================================================

  const {
    data: businesses,
    error: businessError,
  } = await supabase
    .from("businesses")
    .select("id, name, slug, owner_id")
    .eq("id", staffMembership.business_id)
    .limit(1);

  if (businessError) {
    logSupabaseError(
      "GET STAFF BUSINESS ERROR:",
      businessError
    );

    return null;
  }

  const business = businesses?.[0];

  if (!business) {
    return null;
  }

  // =========================================================
  // 5. VALIDATE ROLE
  // =========================================================

  const validRoles: BusinessRole[] = [
    "owner",
    "admin",
    "trainer",
    "staff",
  ];

  const role = validRoles.includes(
    staffMembership.role as BusinessRole
  )
    ? (staffMembership.role as BusinessRole)
    : "staff";

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    owner_id: business.owner_id,
    currentUserRole: role,
  };
}