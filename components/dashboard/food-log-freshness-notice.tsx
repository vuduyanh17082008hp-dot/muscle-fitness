"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

import { forgetPendingSaves, readPendingSaves, reconcileDayPendingSaves, type PendingSave } from "@/lib/nutrition/food-log/client-save";

/**
 * Today's totals on the Dashboard are read server-side, but an unconfirmed
 * food save is only known to this tab (sessionStorage, per user). While one is
 * pending, say so instead of letting the numbers read as verified. Re-checks
 * read-only by the original key — never re-sends the write.
 * ponytail: per-tab only; another tab/device or cleared storage can't see it.
 */
export function FoodLogFreshnessNotice({ userId, logDate }: { userId: string; logDate: string }) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  // Stale saves the server read back as absent — dismissable by the user, never dropped on its own.
  const [notFound, setNotFound] = useState<PendingSave[]>([]);

  const recheck = useCallback(async () => {
    setChecking(true);
    const result = await reconcileDayPendingSaves(userId, logDate);
    setPendingCount(result.unresolved.length + result.notFound.length);
    setNotFound(result.notFound);
    setCheckFailed(result.checkFailed);
    setChecking(false);
    if (result.savedAny) router.refresh(); // server re-reads today's totals with the confirmed row
  }, [userId, logDate, router]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const count = readPendingSaves(userId).filter((p) => p.logDate === logDate).length;
      setPendingCount(count);
      return count > 0 ? recheck() : undefined;
    });
  }, [userId, logDate, recheck]);

  if (pendingCount === 0) return null;
  const allNotFound = notFound.length === pendingCount;

  function dismiss() {
    forgetPendingSaves(userId, new Set(notFound.map((p) => p.key)));
    setPendingCount((count) => count - notFound.length);
    setNotFound([]);
  }

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3">
      <p className="flex items-start gap-2 text-sm text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          {allNotFound
            ? `${pendingCount === 1 ? "An earlier food save isn't" : `${pendingCount} earlier food saves aren't`} in today's log — the server checked and found no entry. `
            : `${pendingCount === 1 ? "A food save from today isn't confirmed yet" : `${pendingCount} food saves from today aren't confirmed yet`} — calories and protein below may not include it. `}
          {checkFailed ? "Couldn't reach the server to check. " : null}
          <Link href="/dashboard/nutrition" className="underline underline-offset-2">
            Review today&apos;s log
          </Link>
        </span>
      </p>
      {allNotFound ? (
        <button
          type="button"
          onClick={dismiss}
          className="flex shrink-0 items-center rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
        >
          Dismiss
        </button>
      ) : (
        <button
          type="button"
          disabled={checking}
          onClick={() => void recheck()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10 disabled:opacity-60"
        >
          <RotateCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
          Check again
        </button>
      )}
    </div>
  );
}
