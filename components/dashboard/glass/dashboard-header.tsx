export type DashboardHeaderProps = {
  displayName: string;
  /** Already formatted in the user's local timezone by the caller — e.g. "Monday, 14 September". */
  todayLabel: string;
  /** Server-computed greeting for the user's local hour — avoids a hardcoded "Good morning". */
  greeting?: string;
  avatarUrl?: string | null;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DashboardHeader({
  displayName,
  todayLabel,
  greeting = "Hello",
  avatarUrl,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-mf-glass-text sm:text-2xl">
          {greeting}, {displayName}.
        </h1>
        <p className="mt-1 text-sm text-mf-glass-text-muted">{todayLabel}</p>
      </div>

      <div className="flex items-center gap-4">
        <p className="hidden text-right text-[10px] font-bold uppercase leading-tight tracking-[0.22em] text-mf-glass-text-muted lg:block">
          Discipline
          <br />
          Builds
          <br />
          Freedom
        </p>

        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-mf-glass-border bg-mf-glass-elevated text-sm font-bold text-mf-glass-text">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} className="size-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            getInitials(displayName)
          )}
        </div>
      </div>
    </header>
  );
}
