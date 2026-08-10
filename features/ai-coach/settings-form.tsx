"use client";

import {
  Bell,
  Brain,
  Check,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

export type AiCoachSettings = {
  preferred_tone:
    | "direct"
    | "supportive"
    | "analytical";
  detail_level:
    | "concise"
    | "balanced"
    | "detailed";
  language: "vi" | "en";
  timezone: string;
  weekly_summary_enabled: boolean;
  workout_reminders_enabled: boolean;
  protein_reminders_enabled: boolean;
  reminder_hour_local: number;
  allow_conversation_memory: boolean;
};

export type AiCoachUsage = {
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
  total_tokens?: number;
};

type SettingsFormProps = {
  initialSettings: AiCoachSettings;
  usage: AiCoachUsage | null;
};

type ToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
};

function Toggle({
  checked,
  onChange,
  label,
  description,
}: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20">
      <span className="pr-4">
        <span className="block text-sm font-semibold text-white">
          {label}
        </span>

        <span className="mt-1 block text-xs leading-5 text-zinc-500">
          {description}
        </span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(event.target.checked)
        }
        className="mt-1 h-5 w-5 shrink-0 accent-amber-400"
      />
    </label>
  );
}

/*
 * Đây là named export.
 * Phải giữ đúng:
 * export function SettingsForm(...)
 */
export function SettingsForm({
  initialSettings,
  usage,
}: SettingsFormProps) {
  const [settings, setSettings] =
    useState<AiCoachSettings>(initialSettings);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function saveSettings() {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch(
        "/api/ai-coach/settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        },
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Không thể lưu cài đặt AI Coach.",
        );
      }

      setSettings(data.settings);
      setSaved(true);

      window.setTimeout(() => {
        setSaved(false);
      }, 2500);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu cài đặt.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dailyLimit = Math.max(
    usage?.daily_limit ?? 10,
    1,
  );

  const messagesUsed = Math.max(
    usage?.messages_used ?? 0,
    0,
  );

  const usagePercent = Math.min(
    (messagesUsed / dailyLimit) * 100,
    100,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/10">
              <Brain className="h-5 w-5 text-amber-400" />
            </div>

            <div>
              <h2 className="text-lg font-black text-white">
                Response preferences
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                Điều chỉnh cách AI Coach phản hồi.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-zinc-300">
                Tone
              </span>

              <select
                value={settings.preferred_tone}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    preferred_tone: event.target
                      .value as AiCoachSettings["preferred_tone"],
                  }))
                }
                className="min-h-12 rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition focus:border-amber-400/40"
              >
                <option value="supportive">
                  Supportive
                </option>

                <option value="direct">
                  Direct
                </option>

                <option value="analytical">
                  Analytical
                </option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-zinc-300">
                Detail level
              </span>

              <select
                value={settings.detail_level}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    detail_level: event.target
                      .value as AiCoachSettings["detail_level"],
                  }))
                }
                className="min-h-12 rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition focus:border-amber-400/40"
              >
                <option value="concise">
                  Concise
                </option>

                <option value="balanced">
                  Balanced
                </option>

                <option value="detailed">
                  Detailed
                </option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-zinc-300">
                Language
              </span>

              <select
                value={settings.language}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    language: event.target
                      .value as AiCoachSettings["language"],
                  }))
                }
                className="min-h-12 rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition focus:border-amber-400/40"
              >
                <option value="vi">
                  Vietnamese
                </option>

                <option value="en">
                  English
                </option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-zinc-300">
                Timezone
              </span>

              <input
                type="text"
                value={settings.timezone}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                placeholder="Asia/Singapore"
                className="min-h-12 rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-400/40"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/10">
              <Bell className="h-5 w-5 text-amber-400" />
            </div>

            <div>
              <h2 className="text-lg font-black text-white">
                Reminders
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                Quản lý nhắc tập, protein và weekly
                summary.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <Toggle
              checked={
                settings.workout_reminders_enabled
              }
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  workout_reminders_enabled: value,
                }))
              }
              label="Missed workout reminders"
              description="Nhắc khi buổi tập đã lên lịch nhưng chưa được hoàn thành."
            />

            <Toggle
              checked={
                settings.protein_reminders_enabled
              }
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  protein_reminders_enabled: value,
                }))
              }
              label="Protein reminders"
              description="Nhắc khi lượng protein thấp hơn đáng kể so với mục tiêu."
            />

            <Toggle
              checked={
                settings.weekly_summary_enabled
              }
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  weekly_summary_enabled: value,
                }))
              }
              label="Weekly progress summary"
              description="Tạo tổng kết workout, nutrition, weight và recovery mỗi tuần."
            />

            <label className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className="text-sm font-semibold text-white">
                Reminder hour
              </span>

              <span className="text-xs leading-5 text-zinc-500">
                Giờ địa phương từ 0 đến 23.
              </span>

              <input
                type="number"
                min={0}
                max={23}
                value={settings.reminder_hour_local}
                onChange={(event) => {
                  const nextValue = Number(
                    event.target.value,
                  );

                  setSettings((current) => ({
                    ...current,
                    reminder_hour_local:
                      Number.isFinite(nextValue)
                        ? Math.min(
                            Math.max(
                              Math.trunc(nextValue),
                              0,
                            ),
                            23,
                          )
                        : 21,
                  }));
                }}
                className="mt-2 min-h-12 rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition focus:border-amber-400/40"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/10">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>

            <div>
              <h2 className="text-lg font-black text-white">
                Privacy and memory
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                Kiểm soát conversation memory.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <Toggle
              checked={
                settings.allow_conversation_memory
              }
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  allow_conversation_memory: value,
                }))
              }
              label="Conversation memory"
              description="Cho phép AI sử dụng bản tóm tắt cuộc trò chuyện để duy trì context."
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 text-sm font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}

          {saving
            ? "Saving..."
            : saved
              ? "Saved"
              : "Save settings"}
        </button>
      </section>

      <aside className="space-y-5">
        <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            Current plan
          </p>

          <p className="mt-3 text-3xl font-black uppercase text-white">
            {usage?.plan_code ?? "free"}
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-sm text-zinc-400">
              Daily AI usage
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {messagesUsed}/{dailyLimit}
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              {Math.max(
                usage?.remaining ??
                  dailyLimit - messagesUsed,
                0,
              )}{" "}
              lượt còn lại
            </p>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{
                  width: `${usagePercent}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <h3 className="font-bold text-white">
            Safety rules
          </h3>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-500">
            <li>Không chẩn đoán bệnh.</li>
            <li>
              Không hướng dẫn PED hoặc hormone.
            </li>
            <li>
              Không tự sửa workout plan khi chưa xác
              nhận.
            </li>
            <li>
              Tool ghi dữ liệu luôn yêu cầu xác nhận.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}