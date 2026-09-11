"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Webcam from "react-webcam"
import { Loader2, X, Zap, ZapOff } from "lucide-react"

import { normalizeBarcode } from "@/lib/nutrition/barcode"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"

type ScannerPhase =
  | "requesting_camera"
  | "scanning"
  | "looking_up"
  | "found"
  | "not_found"
  | "camera_denied"
  | "camera_unavailable"
  | "unsupported"
  | "network_error"

type BarcodeScannerProps = {
  onFound: (food: NormalizedFood, code: string) => void
  onSwitchToSearch: () => void
  onSwitchToManual: () => void
  onClose: () => void
}

/** Native BarcodeDetector isn't in every TS DOM lib version yet — narrow shape we actually use. */
type BrowserBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

function getNativeBarcodeDetectorCtor():
  | (new (options: { formats: string[] }) => BrowserBarcodeDetector)
  | null {
  if (typeof window === "undefined") return null
  const ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BrowserBarcodeDetector }).BarcodeDetector
  return ctor ?? null
}

const SCAN_INTERVAL_MS = 300

export function BarcodeScanner({ onFound, onSwitchToSearch, onSwitchToManual, onClose }: BarcodeScannerProps) {
  const webcamRef = useRef<Webcam>(null)
  const [phase, setPhase] = useState<ScannerPhase>("requesting_camera")
  const [manualCode, setManualCode] = useState("")
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)

  const lockedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null)

  const runLookup = useCallback(
    async (rawCode: string) => {
      if (lockedRef.current) return

      const normalized = normalizeBarcode(rawCode)

      if (!normalized) return

      lockedRef.current = true
      stopScanning()
      setPhase("looking_up")

      try {
        const response = await fetch(`/api/nutrition/foods/barcode?code=${encodeURIComponent(normalized.code)}`)
        const data = await response.json()

        if (!response.ok || !data.ok) {
          setPhase("network_error")
          return
        }

        if (!data.food) {
          setNotFoundCode(normalized.code)
          setPhase("not_found")
          return
        }

        setPhase("found")
        onFound(data.food as NormalizedFood, normalized.code)
      } catch {
        setPhase("network_error")
      }
    },
    [onFound],
  )

  function stopScanning() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    zxingControlsRef.current?.stop()
    zxingControlsRef.current = null
  }

  const startScanning = useCallback(async () => {
    const video = webcamRef.current?.video
    if (!video) return

    const NativeDetector = getNativeBarcodeDetectorCtor()

    if (NativeDetector) {
      const detector = new NativeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] })

      intervalRef.current = setInterval(async () => {
        if (lockedRef.current) return

        try {
          const results = await detector.detect(video)
          const first = results[0]
          if (first?.rawValue) {
            void runLookup(first.rawValue)
          }
        } catch {
          // Transient per-frame detection errors are expected and ignored.
        }
      }, SCAN_INTERVAL_MS)

      return
    }

    // Fallback: @zxing/browser for browsers without native BarcodeDetector (notably iOS Safari).
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library")

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ])

      const reader = new BrowserMultiFormatReader(hints)

      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (lockedRef.current || !result) return
        void runLookup(result.getText())
      })

      zxingControlsRef.current = controls
    } catch (error) {
      console.warn("[BARCODE SCANNER] zxing fallback failed to start:", error)
      setPhase("unsupported")
    }
  }, [runLookup])

  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [])

  function handleUserMedia() {
    setPhase("scanning")

    const track = webcamRef.current?.stream?.getVideoTracks()[0]
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
    setTorchSupported(Boolean(capabilities?.torch))

    void startScanning()
  }

  function handleUserMediaError(error: string | DOMException) {
    const name = typeof error === "string" ? error : error.name

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setPhase("camera_denied")
    } else {
      setPhase("camera_unavailable")
    }
  }

  async function toggleTorch() {
    const track = webcamRef.current?.stream?.getVideoTracks()[0]
    if (!track) return

    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      // Torch control is best-effort — silently ignore unsupported devices.
    }
  }

  function retryAfterNotFoundOrError() {
    lockedRef.current = false
    setNotFoundCode(null)
    setPhase("scanning")
    void startScanning()
  }

  function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault()
    void runLookup(manualCode)
  }

  const showCameraView = phase === "scanning" || phase === "requesting_camera" || phase === "looking_up"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Scan barcode</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="grid size-9 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      {showCameraView ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={{ facingMode: "environment", width: 1280, height: 720 }}
            onUserMedia={handleUserMedia}
            onUserMediaError={handleUserMediaError}
            className="aspect-[4/3] w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-3/4 rounded-2xl border-2 border-amber-400/70" />
          </div>

          {phase === "requesting_camera" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-zinc-300">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Opening camera…
            </div>
          ) : null}

          {phase === "looking_up" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Looking up product…
            </div>
          ) : null}

          {phase === "scanning" && torchSupported ? (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn off flash" : "Turn on flash"}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 text-white"
            >
              {torchOn ? <ZapOff className="size-5" /> : <Zap className="size-5" />}
            </button>
          ) : null}

          {phase === "scanning" ? (
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-zinc-300">
              Align the barcode inside the frame
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "camera_denied" ? (
        <StatusPanel title="Camera access needed" message="Allow camera access, or enter the barcode manually below." />
      ) : null}

      {phase === "camera_unavailable" || phase === "unsupported" ? (
        <StatusPanel
          title="Camera unavailable"
          message="Your device or browser doesn't support barcode scanning here. Enter the barcode manually below, or use search."
        />
      ) : null}

      {phase === "not_found" ? (
        <StatusPanel
          title="Product not found"
          message={`We couldn't find barcode ${notFoundCode} in our current food sources.`}
        />
      ) : null}

      {phase === "network_error" ? (
        <StatusPanel
          title="Network error"
          message="Food lookup is temporarily unavailable. Try again, or use search / manual entry."
        />
      ) : null}

      {(phase === "not_found" || phase === "network_error") ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={retryAfterNotFoundOrError}
            className="min-h-11 flex-1 rounded-xl border border-white/10 text-sm font-semibold text-white hover:bg-white/5"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSwitchToSearch}
            className="min-h-11 flex-1 rounded-xl border border-white/10 text-sm font-semibold text-white hover:bg-white/5"
          >
            Search instead
          </button>
        </div>
      ) : null}

      <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
        <label htmlFor="manual-barcode" className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Enter barcode manually
        </label>
        <div className="flex gap-2">
          <input
            id="manual-barcode"
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="e.g. 5000159407236"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-bold text-black disabled:opacity-40"
          >
            Look up
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={onSwitchToManual}
        className="text-center text-xs font-semibold text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
      >
        Or add this food&apos;s nutrition manually
      </button>
    </div>
  )
}

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
      <p className="text-sm font-bold text-amber-300">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{message}</p>
    </div>
  )
}
