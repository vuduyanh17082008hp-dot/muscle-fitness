"use client";

import {
  Clock3,
  MessageSquare,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Thread = {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string | null;
};

export function HistoryClient({
  initialThreads,
}: {
  initialThreads: Thread[];
}) {
  const router = useRouter();
  const [threads, setThreads] =
    useState(initialThreads);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  async function deleteThread(thread: Thread) {
    const confirmed = window.confirm(
      `Xóa vĩnh viễn cuộc trò chuyện "${thread.title}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(thread.id);

    try {
      const response = await fetch(
        `/api/ai-coach/threads/${thread.id}`,
        {
          method: "DELETE",
        },
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Không thể xóa cuộc trò chuyện.",
        );
      }

      setThreads((current) =>
        current.filter(
          (item) => item.id !== thread.id,
        ),
      );

      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể xóa.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (threads.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-zinc-600" />

        <h2 className="mt-4 text-xl font-bold text-white">
          Chưa có lịch sử trò chuyện
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          Cuộc trò chuyện mới sẽ xuất hiện tại đây.
        </p>

        <Link
          href="/ai-coach"
          className="mt-6 inline-flex rounded-2xl bg-amber-400 px-5 py-3 text-sm font-bold text-black"
        >
          Start AI Coach
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {threads.map((thread) => (
        <article
          key={thread.id}
          className="group flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-400/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <Link
            href={`/ai-coach?thread=${thread.id}`}
            className="min-w-0 flex-1"
          >
            <h2 className="truncate text-base font-bold text-white transition group-hover:text-amber-300">
              {thread.title}
            </h2>

            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <Clock3 className="h-3.5 w-3.5" />

              {new Intl.DateTimeFormat("vi-VN", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(
                new Date(
                  thread.last_message_at ??
                    thread.created_at,
                ),
              )}
            </div>
          </Link>

          <button
            type="button"
            onClick={() =>
              void deleteThread(thread)
            }
            disabled={deletingId === thread.id}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deletingId === thread.id
              ? "Deleting..."
              : "Delete"}
          </button>
        </article>
      ))}
    </div>
  );
}