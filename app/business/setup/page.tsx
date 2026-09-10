import {
  BriefcaseBusiness,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function BusinessSetupPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // ============================================================
  // EXISTING BUSINESS?
  // ============================================================

  const {
    data: ownedBusinesses,
  } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);

  if (ownedBusinesses?.length) {
    redirect("/business");
  }

  async function createBusiness(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    }

    const rawName = formData.get("name");

    const name =
      typeof rawName === "string"
        ? rawName.trim()
        : "";

    if (name.length < 2) {
      return;
    }

    const slugBase = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const slug = `${
      slugBase || "business"
    }-${Date.now().toString().slice(-6)}`;

    const {
      data: business,
      error,
    } = await supabase
      .from("businesses")
      .insert({
        name,
        slug,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(
        `Unable to create business: ${error.message}`
      );
    }

    await supabase
      .from("business_staff")
      .upsert(
        {
          business_id: business.id,
          user_id: user.id,
          role: "owner",
        },
        {
          onConflict: "business_id,user_id",
        }
      );

    redirect("/business");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 py-12 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
          <BriefcaseBusiness className="h-6 w-6" />
        </div>

        <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-zinc-500">
          MUSCLE FITNESS BUSINESS
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          Create Business Workspace
        </h1>

        <p className="mt-3 leading-7 text-zinc-400">
          Set up your gym, coaching business or fitness organisation.
        </p>

        <form
          action={createBusiness}
          className="mt-8 space-y-5"
        >
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Business name
            </label>

            <input
              id="name"
              name="name"
              required
              minLength={2}
              autoComplete="organization"
              placeholder="Muscle Fitness Gym"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-zinc-200"
          >
            Create Business Workspace
          </button>
        </form>

        <Link
          href="/dashboard"
          className="mt-5 block text-center text-sm text-zinc-500 transition hover:text-white"
        >
          Return to Client Dashboard
        </Link>
      </section>
    </main>
  );
}