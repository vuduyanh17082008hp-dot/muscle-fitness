"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

export async function adminLoginAction(formData: FormData) {
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");

  const email =
    typeof emailRaw === "string"
      ? emailRaw.trim().toLowerCase()
      : "";

  const password =
    typeof passwordRaw === "string"
      ? passwordRaw
      : "";

  // ============================================================
  // VALIDATION
  // ============================================================

  if (!email || !password) {
    redirect(
      `/admin/login?error=${encodeMessage(
        "Please enter your email and password."
      )}`
    );
  }

  const supabase = await createClient();

  // ============================================================
  // LOGIN
  // ============================================================

  const {
    data,
    error: loginError,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError || !data.user) {
    redirect(
      `/admin/login?error=${encodeMessage(
        "Invalid email or password."
      )}`
    );
  }

  const user = data.user;

  // ============================================================
  // CHECK OWNER
  // ============================================================

  const {
    data: ownedBusinesses,
    error: ownerError,
  } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);

  if (!ownerError && ownedBusinesses?.length) {
    redirect("/business");
  }

  // ============================================================
  // CHECK ADMIN / OWNER STAFF ROLE
  // ============================================================

  const {
    data: staffRows,
    error: staffError,
  } = await supabase
    .from("business_staff")
    .select("business_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (!staffError && staffRows?.length) {
    redirect("/business");
  }

  // ============================================================
  // NOT ADMIN
  // ============================================================

  await supabase.auth.signOut();

  redirect(
    `/admin/login?error=${encodeMessage(
      "This account does not have Business Admin access."
    )}`
  );
}