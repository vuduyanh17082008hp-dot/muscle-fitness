import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  title: "Terms of Service | Muscle Fitness",
};

/**
 * Linked from the signup consent checkbox (app/register/register-form.tsx).
 * That link previously 404'd — this is an honest placeholder, not
 * fabricated legal text, pending real legal review. Never present
 * this content as a binding agreement.
 */
export default function TermsPage() {
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
            title="Terms of Service"
            description="Muscle Fitness is under active development. Formal Terms of Service are being finalized with legal review and are not yet published here."
          />
        </div>

        <section className="mt-6 rounded-[20px] border border-white/10 bg-mf-surface p-6 sm:p-8">
          <div className="flex items-center gap-2 text-mf-cyan">
            <FileText className="size-4" aria-hidden="true" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Placeholder</p>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
            This page exists so the link from account creation resolves to something real rather
            than a broken page. It is not a substitute for reviewed legal terms and creates no
            binding agreement. Contact the team directly with any questions about acceptable use
            or account terms in the meantime.
          </p>
        </section>
      </div>
    </main>
  );
}
