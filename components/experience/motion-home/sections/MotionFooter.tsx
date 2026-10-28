import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

/** Rest state — no scroll-triggered animation, just simple hover underline. */
export function MotionFooter({ routes }: { routes: HomepageRoutes }) {
  const columns: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
    {
      heading: "Product",
      links: [
        // Product = this page's chapters; Account opens the app.
        { label: "Training", href: "#training" },
        { label: "Nutrition", href: "#nutrition" },
        { label: "Recovery", href: "#recovery" },
        { label: "Dante", href: "#dante" },
      ],
    },
    {
      heading: "Account",
      links: [
        { label: "Dashboard", href: routes.dashboard },
        { label: "Log in", href: routes.login },
        { label: "Start now", href: routes.signup },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "AI Fair", href: routes.aiFair },
        { label: "Responsible AI", href: routes.responsibleAi },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/10 bg-[var(--mf-pub-bg)] px-6 py-14 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <Logo tagline="AI-powered personal training" />
          <p className="mt-5 max-w-xs text-sm leading-6 text-zinc-400">
            One profile. One system. One coach.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.heading}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{column.heading}</p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 underline-offset-4 transition duration-[350ms] ease-out hover:text-zinc-200 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-white/5 pt-6 text-sm text-zinc-400">
        <p>© {new Date().getFullYear()} Muscle Fitness.</p>
      </div>
    </footer>
  );
}
