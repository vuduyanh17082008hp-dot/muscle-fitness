import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-svh bg-[#f3f5f3] p-3 sm:p-5 lg:p-8">
      <div
        className={[
          "mx-auto grid",
          "min-h-[calc(100svh-1.5rem)]",
          "w-full max-w-[1440px]",
          "overflow-hidden rounded-[24px]",
          "border border-border bg-white",
          "shadow-[0_24px_80px_rgba(18,24,20,0.08)]",
          "lg:min-h-[calc(100svh-4rem)]",
          "lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]",
        ].join(" ")}
      >
        <section
          className={[
            "relative hidden overflow-hidden",
            "bg-[#050505] p-10 text-white",
            "lg:flex lg:flex-col lg:justify-between",
            "xl:p-14",
          ].join(" ")}
        >
          <div
            aria-hidden="true"
            className={[
              "pointer-events-none absolute inset-0",
              "bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.10),transparent_30%)]",
            ].join(" ")}
          />

          <Link
            href="/"
            className="relative text-lg font-black tracking-[0.14em]"
          >
            MUSCLE FITNESS
          </Link>

          <div className="relative max-w-2xl">
            <p className="text-[10px] font-semibold tracking-[0.34em] text-white/45">
              TRAIN WITH PURPOSE
            </p>

            <h1
              className={[
                "mt-7",
                "text-[clamp(58px,6vw,104px)]",
                "font-black leading-[0.84]",
                "tracking-[-0.065em]",
              ].join(" ")}
            >
              BUILD YOUR
              <br />
              STRONGEST
              <br />
              SELF.
            </h1>

            <p className="mt-8 max-w-xl text-sm leading-7 text-white/50">
              Theo dõi luyện tập, xây dựng kế hoạch dinh dưỡng
              và nhận hướng dẫn từ AI Coach trong một hệ thống
              thống nhất.
            </p>
          </div>

          <div
            className={[
              "relative flex items-center justify-between",
              "border-t border-white/10 pt-6",
              "text-[9px] font-semibold",
              "tracking-[0.24em] text-white/35",
            ].join(" ")}
          >
            <span>PERSONALISED FITNESS</span>
            <span>MUSCLEFITNESS</span>
          </div>
        </section>

        <section className="flex min-h-[680px] flex-col bg-white">
          <header
            className={[
              "flex min-h-20 items-center justify-between",
              "border-b border-border px-5",
              "sm:px-8 lg:px-10",
            ].join(" ")}
          >
            <Link
              href="/"
              className="font-bold tracking-[-0.025em] lg:hidden"
            >
              MuscleFitness
            </Link>

            <p className="hidden text-sm text-muted-foreground lg:block">
              Đăng nhập thành viên
            </p>

            <Link
              href="/signup"
              className={[
                "rounded-xl border border-border",
                "px-4 py-2 text-sm font-medium",
                "transition-colors hover:bg-muted",
              ].join(" ")}
            >
              Tạo tài khoản
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
            <div className="w-full max-w-[460px]">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}