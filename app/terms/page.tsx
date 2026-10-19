import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  title: "Terms of Service | Muscle Fitness",
};

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
            title="Terms of use"
            description="Short terms for using Muscle Fitness. This is not a fabricated corporate agreement."
          />
        </div>

        <article className="mt-6 space-y-5 rounded-[20px] border border-white/10 bg-mf-surface p-6 text-sm leading-6 text-zinc-300 sm:p-8">
          <p>
            Muscle Fitness is a student / competition product. By creating an
            account or using the app, you agree to use it as described here.
          </p>

          <section>
            <h2 className="text-base font-semibold text-white">Service use</h2>
            <p className="mt-2 text-zinc-400">
              The app provides training, nutrition, recovery, progress, and
              Dante guidance for personal fitness use.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Account responsibility</h2>
            <p className="mt-2 text-zinc-400">
              You are responsible for keeping your login details safe and for
              activity on your account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Fitness guidance only</h2>
            <p className="mt-2 text-zinc-400">
              Content in the app is educational fitness guidance, not a
              personal training contract and not a guarantee of results.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">No medical diagnosis or treatment</h2>
            <p className="mt-2 text-zinc-400">
              Muscle Fitness does not diagnose, treat, or manage medical
              conditions. Seek a qualified professional for health concerns.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">AI can be imperfect</h2>
            <p className="mt-2 text-zinc-400">
              Dante and other AI features can be wrong, incomplete, or
              outdated. See{" "}
              <Link href="/responsible-ai" className="font-semibold text-white underline underline-offset-4">
                Responsible AI
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">You decide</h2>
            <p className="mt-2 text-zinc-400">
              You remain responsible for what you do in training, eating, and
              recovery. Confirm important changes yourself.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Acceptable use</h2>
            <p className="mt-2 text-zinc-400">
              Do not misuse the service, attempt to access other people&apos;s
              accounts or data, or use the app to generate harmful
              instructions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Availability</h2>
            <p className="mt-2 text-zinc-400">
              Features may change, break, or be withdrawn. We do not promise
              uninterrupted service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Limitation</h2>
            <p className="mt-2 text-zinc-400">
              To the extent allowed by law, Muscle Fitness is provided as-is.
              We are not responsible for injuries, lost data, or decisions
              you make based on the app.
            </p>
          </section>

          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Effective 6 October 2026
          </p>
        </article>
      </div>
    </main>
  );
}
