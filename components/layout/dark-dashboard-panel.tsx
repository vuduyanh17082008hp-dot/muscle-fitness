import type { ReactNode } from "react";

type DarkDashboardPanelProps = {
  children: ReactNode;
  className?: string;
};

export function DarkDashboardPanel({
  children,
  className = "",
}: DarkDashboardPanelProps) {
  return (
    <section
      className={[
        "relative overflow-hidden",
        "rounded-[24px]",
        "border border-black/10",
        "bg-[#050505] text-white",
        "shadow-[0_24px_70px_rgba(18,24,20,0.10)]",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(circle_at_78%_10%,rgba(255,255,255,0.05),transparent_27%)]",
        ].join(" ")}
        aria-hidden="true"
      />

      <div className="relative">
        {children}
      </div>
    </section>
  );
}