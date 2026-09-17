import Link from "next/link";

import { requireAdmin } from "@/lib/auth/permissions";
import { buildValidationDashboard } from "@/lib/dante-core/validation/dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ userId?: string }> };

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function DanteValidationPage({ searchParams }: PageProps) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const requested = params.userId?.trim();
  const targetUserId = requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : actor.userId;
  const supabase = await createClient();
  const dashboard = await buildValidationDashboard(supabase, targetUserId);

  return (
    <main className="min-h-screen bg-mf-bg px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">Internal · Phase 4 · Validation only</p>
          <h1 className="mt-2 text-3xl font-black">Dante longitudinal evidence</h1>
          <p className="mt-2 text-sm text-zinc-400">Production remains authoritative. This view does not promote or modify recommendations.</p>
          <form className="mt-5 flex flex-wrap gap-2" action="/admin/dante-validation" method="get">
            <input name="userId" defaultValue={targetUserId} aria-label="Athlete user ID" className="min-w-80 rounded-lg border border-white/10 bg-black px-3 py-2 text-sm" />
            <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black">Load scoped athlete</button>
            <Link href="/admin" className="rounded-lg border border-white/10 px-4 py-2 text-sm">Admin home</Link>
          </form>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(dashboard.overview).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-zinc-950 p-4">
              <p className="break-words text-xs uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-2 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <h2 className="font-bold">Promotion-readiness report</h2>
            <p className="mt-1 text-xs text-amber-300">Mode: {dashboard.promotion.mode} · Autonomous promotion: NO</p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(dashboard.promotion.gates).map(([gate, status]) => (
                <div key={gate} className="flex justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"><dt>{gate}</dt><dd>{status}</dd></div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <h2 className="font-bold">Data quality</h2>
            {dashboard.dataQuality.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">{dashboard.dataQuality.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-300">No detected trace-integrity issue.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
          <h2 className="font-bold">Athlete timeline and recommendation traces</h2>
          <div className="mt-4 space-y-3">
            {[...dashboard.validationEvents, ...dashboard.shadowEvents]
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .slice(0, 50)
              .map((event) => (
                <article key={`${"eventType" in event ? event.eventType : "event"}-${event.id}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-400"><span>{event.eventType}</span><time>{event.occurredAt}</time></div>
                  <p className="mt-1 break-all text-xs">Recommendation: {event.recommendationId ?? "not linked"}</p>
                  <JsonBlock value={event} />
                </article>
              ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><h2 className="font-bold">Raw observation provenance</h2><JsonBlock value={dashboard.observations} /></div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><h2 className="font-bold">Learned patterns and revision state</h2><JsonBlock value={dashboard.patterns} /></div>
        </section>
      </div>
    </main>
  );
}
