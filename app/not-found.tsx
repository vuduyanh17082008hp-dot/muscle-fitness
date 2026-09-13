import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className={[
        "mx-auto grid min-h-[70vh] max-w-2xl",
        "place-content-center px-4 text-center text-white",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-mf-sunset">
        404
      </p>

      <h1 className="mt-2 text-4xl font-bold tracking-tight">
        Page not found
      </h1>

      <p className="mt-4 text-zinc-400">
        This link may have changed or the content no longer exists.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className={[
            "rounded-lg bg-mf-sunset px-4 py-2",
            "text-sm font-medium text-black",
          ].join(" ")}
        >
          Back home
        </Link>

        <Link
          href="/dashboard"
          className={[
            "rounded-lg border border-white/10 bg-mf-surface px-4 py-2",
            "text-sm font-medium text-white",
          ].join(" ")}
        >
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
