import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  title: "Privacy Policy | Muscle Fitness",
};

/**
 * Linked from the signup consent checkbox (app/register/register-form.tsx).
 * That link previously 404'd — this is an honest placeholder, not a
 * fabricated privacy policy, pending real legal review. See
 * /responsible-ai for the (real, already-written) explanation of what
 * data informs Dante and how it's used.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-mf-bg px-5 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back home
        </Link>

        <div className="mt-10">
          <PageHeader
            eyebrow="Legal"
            title="Privacy Policy"
            description="Muscle Fitness is under active development. A formal Privacy Policy is being finalized with legal review and is not yet published here."
          />
        </div>

        <section className="mt-6 rounded-[20px] border border-white/10 bg-mf-surface p-6 sm:p-8">
          <div className="flex items-center gap-2 text-mf-cyan">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Placeholder</p>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
            This page exists so the link from account creation resolves to something real rather
            than a broken page. It is not a substitute for a reviewed privacy policy. For a real,
            already-written explanation of what data can inform Dante&apos;s guidance, see{" "}
            <Link href="/responsible-ai" className="font-semibold text-white underline underline-offset-4">
              Responsible AI
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
