// Built-in sound and haptic cues. No audio files: tones are made with the Web Audio API.
//
// The design follows how people read sound:
//  - Rising notes in a major key feel like "yes / done". The bigger the achievement, the longer and richer the cue.
//  - Falling, soft, low notes feel like "no / stopped" without alarming anyone. Nothing is ever harsh or loud.
//  - Things that happen all day (taps) get the shortest possible tick, so they never become annoying.
//  - Only a new job request for a driver is allowed to be insistent, because missing it costs money.
// Browsers only allow sound after a tap, so the first tap anywhere unlocks audio. A mute switch is kept on the phone.

type Note = { f: number; at: number; len: number; vol?: number; type?: OscillatorType };

const CUES = {
  // Tiny tick on every button press.
  tap: { notes: [{ f: 1400, at: 0, len: 0.035, vol: 0.05 }], buzz: 8 },
  // "Got it": a quick rising pair (booking sent, job accepted, code added, online).
  confirm: { notes: [{ f: 659, at: 0, len: 0.12 }, { f: 880, at: 0.09, len: 0.18 }], buzz: 20 },
  // Something small went right (saved, copied).
  ok: { notes: [{ f: 784, at: 0, len: 0.14, vol: 0.14 }], buzz: 12 },
  // A big win (delivered): rising major arpeggio, then a sparkle on top.
  success: {
    notes: [
      { f: 523, at: 0, len: 0.16 }, { f: 659, at: 0.12, len: 0.16 }, { f: 784, at: 0.24, len: 0.16 },
      { f: 1047, at: 0.36, len: 0.5 }, { f: 1568, at: 0.5, len: 0.4, vol: 0.08 },
    ],
    buzz: [40, 40, 80],
  },
  // Money arrived: two quick bright pings, like a till.
  cash: { notes: [{ f: 1319, at: 0, len: 0.1 }, { f: 1760, at: 0.1, len: 0.45 }], buzz: [30, 30, 30] },
  // Someone is here (driver arrived, parcel picked up): friendly ding-dong.
  arrive: { notes: [{ f: 880, at: 0, len: 0.3 }, { f: 659, at: 0.28, len: 0.45 }], buzz: [60, 40, 60] },
  // A gentle nudge that needs a look, with no alarm in it.
  nudge: { notes: [{ f: 740, at: 0, len: 0.2, vol: 0.18 }], buzz: 25 },
  // Cancelled or declined: soft, low and falling. It says "stopped" without scolding.
  cancel: { notes: [{ f: 440, at: 0, len: 0.15, vol: 0.14 }, { f: 330, at: 0.13, len: 0.3, vol: 0.14 }], buzz: 40 },
  // Something went wrong: one low, soft double note.
  error: { notes: [{ f: 262, at: 0, len: 0.12, vol: 0.16, type: "triangle" }, { f: 262, at: 0.17, len: 0.2, vol: 0.16, type: "triangle" }], buzz: [60, 40, 60] },
} satisfies Record<string, { notes: Note[]; buzz: number | number[] }>;

export type Cue = keyof typeof CUES;

const KEY = "pikop-sound";
let ctx: AudioContext | null = null;
let last = 0;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) play("ok");
}

export function unlockSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // No audio support: vibration and the screen still work.
  }
}

export function play(cue: Cue) {
  if (typeof window === "undefined" || !soundOn()) return;
  // Never stack cues on top of each other; the most recent one wins after a short gap.
  const now = Date.now();
  if (cue === "tap" && now - last < 250) return;
  last = now;
  const c = CUES[cue];
  try {
    navigator.vibrate?.(c.buzz);
  } catch {}
  if (!ctx || ctx.state !== "running") return;
  for (const n of c.notes as Note[]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.f;
    const t = ctx.currentTime + n.at;
    const v = n.vol ?? 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(v, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.len + 0.05);
  }
}

// Unlock audio on the first tap and tick softly on every button.
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      unlockSound();
      const el = (e.target as HTMLElement | null)?.closest?.("button, a.btn, [role=button]") as HTMLButtonElement | null;
      if (el && !el.disabled) play("tap");
    },
    { capture: true },
  );
}
