"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives the phone camera and reports decoded QR strings.
 *
 * Two decoders, in preference order:
 *  1. BarcodeDetector — native, hardware-accelerated, present on Android Chrome
 *     (the device this is actually used on). Costs nothing when available.
 *  2. jsQR — pure JS over a canvas frame. Slower, but it is the only thing that
 *     works on iOS Safari, which still ships no BarcodeDetector.
 *
 * A missing camera here is almost never a broken camera. The two real causes,
 * both reported verbatim so nobody debugs the wrong one:
 *  - the page is not a secure context (plain http://), so getUserMedia refuses;
 *  - Permissions-Policy blocks it. This app sends `camera=()` on every route
 *    except /scan/:id (see next.config.ts) — reach the scanner by any other URL
 *    and the camera is off by policy.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export type ScannerState = "idle" | "starting" | "running" | "error";

export function useQrScanner(onDecode: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const runningRef = useRef(false);
  // Kept in a ref so restarting the camera never re-binds a stale callback.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  // The lamp on the back of the phone. Half of these events are evening
  // assemblies under a tent, where a laminated card is unreadable without it.
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState("starting");

    if (!window.isSecureContext) {
      setState("error");
      setError(
        "The camera needs a secure connection. Open this page over https:// — on plain http:// the browser blocks it outright.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("This browser cannot open a camera.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera, which is the one pointed at a card.
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      // `torch` is a non-standard constraint: Chrome on Android has it, Safari
      // does not, and neither ships it in TypeScript's DOM lib. Absence is the
      // normal case, so it is detected rather than assumed.
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const capabilities = (
        track?.getCapabilities as undefined | (() => { torch?: boolean })
      )?.call(track);
      setTorchAvailable(Boolean(capabilities?.torch));

      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is not ready.");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (Ctor) {
        try {
          detectorRef.current = new Ctor({ formats: ["qr_code"] });
        } catch {
          detectorRef.current = null;
        }
      }

      runningRef.current = true;
      setState("running");
      void tick();
    } catch (err) {
      setState("error");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setError(
          "Camera access was refused. Allow the camera for this site, and check that the page URL starts with /scan — the camera is disabled by policy everywhere else in this app.",
        );
      } else if (name === "NotFoundError") {
        setError("No camera was found on this device.");
      } else {
        setError(err instanceof Error ? err.message : "The camera could not be started.");
      }
    }
    // tick is stable for the component's lifetime; excluding it keeps `start`
    // from being recreated on every render and restarting the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(async () => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width > 0 && height > 0) {
        try {
          if (detectorRef.current) {
            const codes = await detectorRef.current.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              onDecodeRef.current(codes[0].rawValue);
            }
          } else {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, width, height);
              const image = ctx.getImageData(0, 0, width, height);
              // Loaded lazily: jsQR is dead weight on devices whose browser has
              // a native BarcodeDetector.
              const { default: jsQR } = await import("jsqr");
              const found = jsQR(image.data, width, height, {
                inversionAttempts: "dontInvert",
              });
              if (found?.data) onDecodeRef.current(found.data);
            }
          }
        } catch {
          // A dropped frame is not worth surfacing; the next one is 16ms away.
        }
      }
    }

    rafRef.current = requestAnimationFrame(() => void tick());
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      // Some devices advertise the capability and then refuse the constraint.
      // Nothing to tell the officer: the button simply does not latch.
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => stop, [stop]);

  return {
    videoRef,
    canvasRef,
    state,
    error,
    start,
    stop,
    torchAvailable,
    torchOn,
    toggleTorch,
  };
}
