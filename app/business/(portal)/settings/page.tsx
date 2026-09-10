import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";

export default async function BusinessSettingsPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <p className="text-sm font-medium text-zinc-500">
        BUSINESS SETTINGS
      </p>

      <h1 className="mt-2 text-3xl font-bold">
        Settings
      </h1>

      <p className="mt-2 text-zinc-400">
        View your current business workspace information.
      </p>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div>
          <p className="text-sm font-medium text-zinc-300">
            Business Name
          </p>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white">
            {business.name}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-zinc-300">
            Workspace ID
          </p>

          <div className="mt-3 break-all rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-zinc-400">
            {business.id}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-zinc-300">
            Your Role
          </p>

          <div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium capitalize text-zinc-300">
            {business.currentUserRole}
          </div>
        </div>
      </div>
    </div>
  );
}