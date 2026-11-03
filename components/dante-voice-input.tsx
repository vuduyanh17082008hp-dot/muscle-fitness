"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MF-S1 Dante voice input: explicit push-to-start / tap-to-stop recording → /api/dante/transcribe → the transcript is
 * put in the composer for the user to edit. It never sends a message and never triggers an action on its own; Send is
 * still the user's. Audio stays in memory and is dropped after the upload (or on Cancel).
 */

const MAX_SECONDS = 60;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const noSubscribe = () => () => {};

type VoiceState ={ kind: "idle" } | { kind: "requesting" } | { kind: "recording"; seconds: number } | { kind: "processing" } | { kind: "error"; message: string };

export function DanteVoiceInput({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  // Hydration-safe: the server renders no mic; the client shows it only where recording can work.
  const supported = useSyncExternalStore(
    noSubscribe,
    () => typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unmount mid-recording: release the microphone (refs only — nothing to re-render).
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function release() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function upload(blob: Blob) {
    setState({ kind: "processing" });
    try {
      const form = new FormData();
      const type = blob.type || "audio/webm";
      form.append("audio", new File([blob], `speech.${type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm"}`, { type }));
      const response = await fetch("/api/dante/transcribe", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
      if (!response.ok || !data.ok || !data.text) {
        setState({ kind: "error", message: data.error ?? "Voice transcription failed. Try again or type instead." });
        return;
      }
      onTranscript(data.text);
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Nothing was sent — try again or type instead." });
    }
  }

  async function start() {
    if (disabled || state.kind === "recording" || state.kind === "processing") return;
    setState({ kind: "requesting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setState({
        kind: "error",
        message: name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow it in your browser's site settings, or type instead."
          : name === "NotFoundError" ? "No microphone was found. You can type instead." : "The microphone couldn't be started. You can type instead.",
      });
      return;
    }
    streamRef.current = stream;
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      chunksRef.current = [];
      release();
      if (cancelledRef.current) {
        setState({ kind: "idle" });
        return;
      }
      if (blob.size === 0) {
        setState({ kind: "error", message: "Nothing was recorded. Try again." });
        return;
      }
      void upload(blob);
    };
    recorder.start(1000);
    const startedAt = Date.now();
    setState({ kind: "recording", seconds: 0 });
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      if (seconds >= MAX_SECONDS) stop();
      else setState({ kind: "recording", seconds });
    }, 250);
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    stop();
  }

  if (!supported) return null;

  const recording = state.kind === "recording";
  const busy = state.kind === "processing" || state.kind === "requesting";
  const status = recording
    ? `Recording ${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")} — tap stop when you're done (max 1:00).`
    : state.kind === "processing" ? "Transcribing… you can edit the text before sending."
      : state.kind === "requesting" ? "Waiting for microphone permission…"
        : state.kind === "error" ? state.message : "";

  return (
    <>
      {status ? (
        <p
          role={state.kind === "error" ? "alert" : "status"}
          className={cn(
            "absolute bottom-full left-3 right-3 mb-1 rounded-md border px-3 py-1.5 text-sm sm:left-4 sm:right-4",
            state.kind === "error" ? "border-mf-glass-warning bg-mf-glass-bg-deep text-mf-glass-warning" : "border-mf-glass-border-strong bg-mf-glass-bg-deep text-mf-glass-text",
          )}
        >
          {recording ? <span aria-hidden="true" className="mr-2 inline-block size-2 animate-pulse rounded-full bg-mf-glass-warning align-middle" /> : null}
          {status}
        </p>
      ) : null}
      {recording ? (
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel recording"
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-mf-glass-border-strong text-mf-glass-text-secondary transition hover:bg-mf-glass-hover"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => (recording ? stop() : void start())}
        disabled={(disabled && !recording) || busy}
        aria-label={recording ? "Stop recording and transcribe" : "Record a voice message"}
        aria-pressed={recording}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-40",
          recording ? "border-mf-glass-warning text-mf-glass-warning" : "border-mf-glass-border-strong text-mf-glass-text hover:bg-mf-glass-hover",
        )}
      >
        {busy ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : recording ? <Square aria-hidden="true" className="size-4 fill-current" /> : <Mic aria-hidden="true" className="size-5" />}
      </button>
    </>
  );
}
