import Link from "next/link";

import DanteChat from "@/components/dante-chat";

export default function ChatbotPage() {
  return (
    <main className="min-h-screen bg-mf-bg px-4 py-6 text-white md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* =================================================
            TOP BAR
        ================================================= */}

        <div className="mb-6 flex items-center justify-between">
          {/* HOME BUTTON */}

          <Link
            href="/"
            className="
              inline-flex
              items-center
              gap-2
              rounded-full
              border
              border-white/15
              bg-white/5
              px-5
              py-3
              text-sm
              font-semibold
              text-white
              transition
              hover:border-[var(--mf-violet)]/50
              hover:bg-[var(--mf-violet)]/10
              hover:text-[var(--mf-violet)]
            "
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19 12H5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />

              <path
                d="M12 19L5 12L12 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            Home
          </Link>

          {/* STATUS */}

          <div className="hidden items-center gap-2 text-sm text-white/50 sm:flex">
            <span className="h-2 w-2 rounded-full bg-green-400" />

            Online
          </div>
        </div>

        {/* =================================================
            DANTE HEADER
        ================================================= */}

        <section className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="
                flex
                h-12
                w-12
                items-center
                justify-center
                rounded-2xl
                border
                border-[var(--mf-violet)]/30
                bg-[var(--mf-violet)]/10
                text-xl
                font-bold
                text-[var(--mf-violet)]
              "
            >
              D
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--mf-violet)]">
                Muscle Fitness Intelligence
              </p>

              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                DANTE
              </h1>
            </div>
          </div>

          <p className="max-w-2xl text-base leading-7 text-white/55">
            Your personal training, nutrition and recovery
            intelligence.
          </p>
        </section>

        {/* =================================================
            CHAT
        ================================================= */}

        <DanteChat />
      </div>
    </main>
  );
}