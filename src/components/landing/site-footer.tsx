import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-bone px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-xl tracking-[0.04em] text-ink">
          Muscle Fitness
        </p>
        <div className="flex gap-6 text-sm text-steel">
          <Link href="/dashboard" className="hover:text-ink">
            App
          </Link>
          <a href="#pricing" className="hover:text-ink">
            Pricing
          </a>
        </div>
      </div>
    </footer>
  );
}
