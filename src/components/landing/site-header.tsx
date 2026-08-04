import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-2xl tracking-[0.04em] text-bone sm:text-3xl"
        >
          Muscle Fitness
        </Link>
        <nav className="flex items-center gap-5 text-sm text-bone/85 sm:gap-8">
          <a href="#method" className="hidden hover:text-lime sm:inline">
            Method
          </a>
          <a href="#programs" className="hidden hover:text-lime sm:inline">
            Programs
          </a>
          <a href="#pricing" className="hover:text-lime">
            Pricing
          </a>
          <Link
            href="/dashboard"
            className="bg-lime px-4 py-2 font-medium text-ink transition hover:bg-white"
          >
            Open app
          </Link>
        </nav>
      </div>
    </header>
  );
}
