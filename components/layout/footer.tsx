import Link from "next/link";

import { Logo } from "@/components/brand/logo";

const productLinks = [
  { label: "Training Course", href: "/training-course" },
  { label: "Meal Plan", href: "/meal-plan" },
  { label: "Progress Dashboard", href: "/dashboard" },
];

const accountLinks = [
  { label: "Login", href: "/login" },
  { label: "Create Account", href: "/signup" },
  { label: "My Story", href: "/story" },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg)] text-[var(--mf-pub-text-muted)]">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Logo />

          <p className="mt-6 max-w-md leading-7">
            Built from a real transformation and created to turn confusion
            into direction, effort into progress and progress into confidence.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-black tracking-[0.2em] text-[var(--mf-brand)]">
            THE SYSTEM
          </h2>

          <div className="mt-5 flex flex-col gap-4">
            {productLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-black tracking-[0.2em] text-[var(--mf-brand)]">
            ACCOUNT
          </h2>

          <div className="mt-5 flex flex-col gap-4">
            {accountLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--mf-pub-border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs tracking-wider md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 MUSCLE FITNESS. ALL RIGHTS RESERVED.</p>

          <p>DEDICATION • DETERMINATION • DRIVE • DISCIPLINE</p>
        </div>
      </div>
    </footer>
  );
}