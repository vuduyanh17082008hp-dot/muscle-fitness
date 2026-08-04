"use client";

import { FormEvent, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function CoachChat() {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I'm your Muscle Fitness coach. Ask about session swaps, recovery, or how to progress this week's lifts.",
    },
  ]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            data.reply ??
            data.error ??
            "Coach is unavailable right now. Try again shortly.",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "Network error talking to the coach. Check your connection.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[28rem] flex-col border border-ink/10 bg-bone">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] text-sm leading-relaxed ${
              message.role === "user"
                ? "ml-auto bg-ink px-4 py-3 text-bone"
                : "bg-mist px-4 py-3 text-ink"
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-ink/10 p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about today's session..."
          className="flex-1 bg-mist px-3 py-2 text-sm text-ink outline-none ring-lime focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {pending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
