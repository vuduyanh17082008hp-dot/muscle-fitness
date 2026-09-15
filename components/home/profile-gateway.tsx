import Link from "next/link";
import { ArrowRight, BrainCircuit } from "lucide-react";

/** The homepage entry point to account creation and fitness onboarding. */
export function ProfileGateway() {
  return (
    <section
      id="get-started"
      aria-labelledby="profile-gateway-title"
      className="scroll-mt-20 border-t border-white/10 px-5 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-14">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--mf-brand)]">
              Your next rep starts here
            </p>
            <h2
              id="profile-gateway-title"
              className="mt-4 max-w-xl text-4xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-5xl"
            >
              Build your fitness profile.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
              Share your goal, training background, nutrition needs and recovery
              context. Dante, your AI assistant, uses your profile to tailor
              training, nutrition and recovery recommendations to you.
            </p>

            <div className="mt-6">
              <Link
                href="/signup"
                aria-describedby="profile-gateway-account"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--mf-brand)] px-6 py-4 text-sm font-black uppercase tracking-wider text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)] hover:shadow-[var(--shadow-brand)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)] sm:w-auto"
              >
                Build my profile
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
              <p id="profile-gateway-account" className="mt-3 text-sm leading-6 text-zinc-400">
                Create an account, then complete your fitness profile.
              </p>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p id="profile-gateway-dante" className="text-sm leading-6 text-zinc-400">
                Have a question first? Ask Dante. Your profile adds personal context.
              </p>
              <Link
                href="/chatbot"
                aria-describedby="profile-gateway-dante"
                className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-bold uppercase tracking-wider text-zinc-200 underline decoration-zinc-600 underline-offset-4 transition hover:text-[var(--mf-brand)] hover:decoration-[var(--mf-brand)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)]"
              >
                <BrainCircuit aria-hidden="true" className="size-4 shrink-0" />
                Ask Dante
              </Link>
            </div>
          </div>

          <div className="border-l-2 border-[var(--mf-brand)]/60 pl-5 lg:mt-1 lg:pl-7">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-300">
              From profile to your next session
            </h3>
            <ol className="mt-5 space-y-5">
              {[
                ["01", "Define your starting point", "Tell us what you want to achieve and how you train, eat and recover."],
                ["02", "Get your baseline", "Complete setup with a training profile, nutrition targets and a recovery baseline."],
                ["03", "Put it into practice", "Enter your dashboard to plan training, track progress and ask Dante for guidance."],
              ].map(([number, title, description]) => (
                <li key={number} className="flex gap-3">
                  <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-[var(--mf-brand)]">
                    {number}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Start before you feel ready.
          </p>
          <ul aria-label="The 4D philosophy" className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {["Dedication", "Determination", "Drive", "Discipline"].map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
