"use client";

/**
 * The tone and the buzz a scan makes.
 *
 * An officer at a door is looking at the card and the person holding it, not at
 * the phone. Sound and vibration are what actually tell them the scan landed;
 * the banner on screen is confirmation they read afterwards, if at all. A
 * distinct pitch per outcome means "that was not a plain accept" is audible
 * without looking down.
 *
 * Synthesised rather than loaded from an audio file: an .mp3 is one more asset
 * that has to be in the service worker's cache before the venue's signal dies,
 * and a silent scanner is a scanner nobody trusts.
 */

type Outcome = "ok" | "duplicate" | "walk_in" | "conflict" | "reject";

/** Hz, and milliseconds. Descending pitch reads as "no" without being taught. */
const TONES: Record<Outcome, { hz: number; ms: number }> = {
  ok: { hz: 1180, ms: 90 },
  walk_in: { hz: 880, ms: 130 },
  duplicate: { hz: 660, ms: 110 },
  // "One event only", already counted elsewhere. Low and long, because the
  // scan WAS recorded and the officer still has to look up and read the
  // warning — this is the one outcome the beep alone cannot finish.
  conflict: { hz: 420, ms: 300 },
  reject: { hz: 320, ms: 240 },
};

const BUZZ: Record<Outcome, number | number[]> = {
  ok: 35,
  walk_in: [30, 60, 30],
  duplicate: [20, 50, 20],
  conflict: [120, 80, 120, 80, 120],
  reject: [90, 70, 90],
};

let context: AudioContext | null = null;

/**
 * Must be called from a real user gesture (the Start button, or the first tap
 * on the screen). Both iOS and Chrome create the AudioContext suspended
 * otherwise, and every later beep is silently dropped.
 */
export function primeScanFeedback(): void {
  try {
    context ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    void context.resume();
  } catch {
    // No Web Audio. The vibration below still works, and so does the screen.
  }
}

export function playScanFeedback(outcome: Outcome): void {
  const tone = TONES[outcome];

  try {
    if (context && context.state === "running") {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = tone.hz;
      // A hard stop clicks. Ramping the gain to near-zero does not.
      gain.gain.setValueAtTime(0.14, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + tone.ms / 1000,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + tone.ms / 1000);
    }
  } catch {
    // Audio is a courtesy; never let it break a scan.
  }

  try {
    navigator.vibrate?.(BUZZ[outcome]);
  } catch {
    // iOS has no Vibration API at all.
  }
}
